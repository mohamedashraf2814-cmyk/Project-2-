import type { MedReminder, RunStatus } from '../types';
import type { EventLog, LoggedEvent } from '../eventLog/eventLog';
import { uid } from '../utilities/rng';
import { dueReminders, type ActiveAlert } from './medication';
import {
  addObstacleAhead, clearObstacles, haltRobot, initialRobot, setCommand, stepRobot,
  type Behavior, type Cmd, type RobotState,
} from './robot';
import { FallDetector, SAMPLE_HZ, SyntheticMotion, type DetectorState, type Sample } from './wearable';

export const DT = 1 / SAMPLE_HZ; // fixed simulation step (s)
export const TICK_MS = Math.round(DT * 1000);
export const CANCEL_WINDOW_S = 10;
const BUFFER = 160;

export type DeviceKey = 'robot' | 'wearable';
export interface DevCloud {
  online: boolean;
  lastSeen: number | null;
}
export interface FallAlert {
  id: string;
  startedAt: number;
  remaining: number; // seconds left in the cancel window
  state: 'pending' | 'cancelled' | 'notified';
  reason: string;
}
export interface SlowState {
  status: RunStatus;
  ranOnce: boolean;
  detector: DetectorState;
  fallScripted: boolean;
  fallAlert: FallAlert | null;
  medAlert: ActiveAlert | null;
  internet: boolean;
  robotCloud: DevCloud;
  wearableCloud: DevCloud;
  /** outcome of simulated delivery for critical events */
  deliveryMode: 'success' | 'failure';
  battery: { robot: number; wearable: number };
  lastEmergencyAt: number | null;
}
export interface FastState {
  time: number;
  robot: RobotState;
  samples: readonly Sample[];
}

export interface Deps {
  log: EventLog;
  now: () => number;
  getReminders: () => MedReminder[];
  patchReminder: (id: string, patch: Partial<MedReminder>) => void;
}

type Channel = 'fast' | 'slow';

const initialSlow = (): SlowState => ({
  status: 'stopped', ranOnce: false, detector: 'monitoring', fallScripted: false, fallAlert: null, medAlert: null,
  internet: true, robotCloud: { online: true, lastSeen: null }, wearableCloud: { online: true, lastSeen: null },
  deliveryMode: 'success', battery: { robot: 100, wearable: 100 }, lastEmergencyAt: null,
});

/**
 * One centralised simulation manager. A single fixed-step timer exists only while the status is "running";
 * pause and stop clear it, so nothing keeps ticking in the background.
 */
export class SimEngine {
  private slow: SlowState = initialSlow();
  private fast: FastState = { time: 0, robot: initialRobot(), samples: [] };
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners: Record<Channel, Set<() => void>> = { fast: new Set(), slow: new Set() };
  private motion = new SyntheticMotion(42);
  private detector = new FallDetector();
  private ticks = 0;
  private buf: Sample[] = [];
  private batteryRaw = { robot: 100, wearable: 100 };

  constructor(private deps: Deps) {}

  // ---------- subscriptions ----------
  subscribe(ch: Channel, fn: () => void) {
    this.listeners[ch].add(fn);
    return () => {
      this.listeners[ch].delete(fn);
    };
  }
  getSlow = () => this.slow;
  getFast = () => this.fast;
  get hasTimer() {
    return this.timer !== null;
  }
  private emit(ch: Channel) {
    this.listeners[ch].forEach((l) => l());
  }
  private setSlow(patch: Partial<SlowState>) {
    this.slow = { ...this.slow, ...patch };
    this.emit('slow');
  }

  // ---------- lifecycle ----------
  start() {
    if (this.slow.status === 'running') return;
    const wasPaused = this.slow.status === 'paused';
    this.setSlow({ status: 'running', ranOnce: true });
    this.deps.log.add({ type: 'sim_start', title: wasPaused ? 'استُكملت المحاكاة' : 'بدأت المحاكاة', detail: 'وضع المحاكاة: كل البيانات تركيبية.' });
    this.arm();
  }
  pause() {
    if (this.slow.status !== 'running') return;
    this.disarm();
    this.setSlow({ status: 'paused' });
    this.deps.log.add({ type: 'sim_pause', title: 'إيقاف مؤقت للمحاكاة', detail: 'الحالة محفوظة ويمكن الاستكمال.' });
  }
  resume() {
    if (this.slow.status === 'paused') this.start();
  }
  /** full stop: motors off, timers cleared, pending simulated alerts closed */
  stop() {
    if (this.slow.status === 'stopped') return;
    this.disarm();
    const patch: Partial<SlowState> = { status: 'stopped' };
    const fa = this.slow.fallAlert;
    if (fa && fa.state === 'pending') {
      patch.fallAlert = { ...fa, state: 'cancelled' };
      this.deps.log.add({ type: 'fall_cancelled', title: 'أُغلق تنبيه السقوط عند إيقاف المحاكاة', detail: 'لم يُرسل إشعار للمرافق.', device: 'wearable' });
    }
    const ma = this.slow.medAlert;
    if (ma && ma.state === 'ringing') {
      patch.medAlert = { ...ma, state: 'dismissed' };
      this.deps.log.add({ type: 'med_dismiss', title: `أُغلق تنبيه «${ma.name}» عند إيقاف المحاكاة`, detail: 'لم يُستلم التنبيه.', device: 'robot' });
    }
    this.motion.clearFall();
    this.detector.reset();
    this.buf = [];
    this.fast = { time: 0, robot: haltRobot(this.fast.robot), samples: [] };
    patch.fallScripted = false;
    patch.detector = 'monitoring';
    this.setSlow(patch);
    this.emit('fast');
    this.deps.log.add({ type: 'sim_stop', title: 'إيقاف كامل للمحاكاة', detail: 'توقفت المحركات وألغيت كل المؤقتات.' });
  }
  /** back to the initial experiment (does not touch the event log) */
  resetExperiment() {
    this.disarm();
    this.motion = new SyntheticMotion(42);
    this.detector = new FallDetector();
    this.buf = [];
    this.ticks = 0;
    this.batteryRaw = { robot: 100, wearable: 100 };
    this.fast = { time: 0, robot: initialRobot(), samples: [] };
    this.slow = initialSlow();
    this.emit('fast');
    this.emit('slow');
  }
  restart() {
    this.stop();
    this.resetExperiment();
    this.start();
  }
  dispose() {
    this.disarm();
    this.listeners.fast.clear();
    this.listeners.slow.clear();
  }
  private arm() {
    if (this.timer) return;
    this.timer = setInterval(() => this.advance(), TICK_MS);
  }
  private disarm() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // ---------- robot controls ----------
  private patchRobot(fn: (r: RobotState) => RobotState) {
    this.fast = { ...this.fast, robot: fn(this.fast.robot) };
    this.emit('fast');
  }
  command(cmd: Cmd) {
    this.patchRobot((r) => setCommand(r, cmd));
  }
  setSpeed(pct: number) {
    this.patchRobot((r) => ({ ...r, speedPct: Math.max(10, Math.min(100, Math.round(pct))) }));
  }
  setBehavior(b: Behavior) {
    this.patchRobot((r) => ({ ...r, behavior: b }));
  }
  setDanger(cm: number) {
    this.patchRobot((r) => ({ ...r, dangerCm: Math.max(10, Math.min(100, Math.round(cm))) }));
  }
  setPatrol(on: boolean) {
    this.patchRobot((r) => ({ ...r, patrol: on, cmd: on ? 'stop' : r.cmd, avoidTurn: 0, mode: on ? 'manual' : r.mode }));
  }
  addObstacle() {
    this.patchRobot((r) => addObstacleAhead(r));
  }
  clearObstacles() {
    this.patchRobot((r) => clearObstacles(r));
  }

  // ---------- tick ----------
  /** one fixed step; public so tests can drive the engine without real time */
  advance(dt = DT) {
    if (this.slow.status !== 'running') return;
    this.ticks += 1;
    const time = this.fast.time + dt;

    // robot
    const { state: robot, events } = stepRobot(this.fast.robot, dt);
    for (const e of events) {
      this.deps.log.add({ type: e.type, title: e.type === 'obstacle_stop' ? 'توقف عند عائق (محاكاة)' : 'تفادي عائق (محاكاة)', detail: e.detail, device: 'robot' });
    }

    // wearable stream + rule-based detector
    const s = this.motion.sample(time);
    this.buf.push(s);
    if (this.buf.length > BUFFER) this.buf.shift();
    const patch: Partial<SlowState> = {};
    const res = this.detector.feed(s);
    if (this.detector.state !== this.slow.detector) patch.detector = this.detector.state;
    if (res && !this.slow.fallAlert) {
      const alert: FallAlert = { id: uid('fall'), startedAt: this.deps.now(), remaining: CANCEL_WINDOW_S, state: 'pending', reason: res.reason };
      patch.fallAlert = alert;
      this.deps.log.add({
        type: 'fall_suspected', title: 'اشتباه في سقوط (محاكاة)', detail: res.reason, severity: 'alert', device: 'wearable', needsReview: true,
      });
    }
    const fa = patch.fallAlert ?? this.slow.fallAlert;
    if (fa && fa.state === 'pending' && !res) {
      const remaining = Math.max(0, fa.remaining - dt);
      if (remaining <= 0) {
        patch.fallAlert = { ...fa, remaining: 0, state: 'notified' };
        this.deps.log.add({
          type: 'fall_notified', title: 'إشعار المرافق بسقوط مشتبه به (محاكاة)', detail: 'انتهت مهلة الإلغاء دون إلغاء. هذا إشعار تجريبي وليس إشعارًا حقيقيًا.',
          severity: 'alert', device: 'wearable', needsReview: true,
        });
        this.flush();
      } else if (Math.floor(remaining) !== Math.floor(fa.remaining)) patch.fallAlert = { ...fa, remaining };
      else this.slow = { ...this.slow, fallAlert: { ...fa, remaining } }; // silent update; emitted on the next slow change
    }

    // once per simulated second
    if (this.ticks % SAMPLE_HZ === 0) this.everySecond(patch);

    this.fast = { time, robot, samples: [...this.buf] };
    if (Object.keys(patch).length) this.setSlow(patch);
    this.emit('fast');
  }

  private everySecond(patch: Partial<SlowState>) {
    const now = this.deps.now();
    // heartbeats (simulated)
    if (this.slow.internet) {
      if (this.slow.robotCloud.online) patch.robotCloud = { online: true, lastSeen: now };
      if (this.slow.wearableCloud.online) patch.wearableCloud = { online: true, lastSeen: now };
    }
    // battery (simulated drain)
    this.batteryRaw.robot = Math.max(0, this.batteryRaw.robot - 0.05);
    this.batteryRaw.wearable = Math.max(0, this.batteryRaw.wearable - 0.02);
    const b = { robot: Math.round(this.batteryRaw.robot), wearable: Math.round(this.batteryRaw.wearable) };
    if (b.robot !== this.slow.battery.robot || b.wearable !== this.slow.battery.wearable) patch.battery = b;
    // scheduled medication reminders
    if (!this.slow.medAlert || this.slow.medAlert.state !== 'ringing') {
      const due = dueReminders(this.deps.getReminders(), new Date(now));
      if (due.length) {
        const r = due[0];
        this.deps.patchReminder(r.id, { lastFiredDay: new Date(now).toISOString().slice(0, 10) });
        patch.medAlert = this.makeAlert(r.name, r.time, false, r.id);
      }
    }
    this.flush();
  }

  // ---------- wearable ----------
  triggerFall(): { ok: boolean; message: string } {
    if (this.slow.status !== 'running') return { ok: false, message: 'شغّل المحاكاة أولًا لتجربة السقوط.' };
    if (this.slow.fallAlert && this.slow.fallAlert.state === 'pending') return { ok: false, message: 'يوجد تنبيه سقوط قيد الانتظار.' };
    this.detector.reset();
    this.motion.triggerFall(this.fast.time);
    this.setSlow({ fallScripted: true, fallAlert: null });
    return { ok: true, message: 'بدأ حدث سقوط تركيبي.' };
  }
  cancelFallAlert() {
    const fa = this.slow.fallAlert;
    if (!fa || fa.state !== 'pending') return;
    this.deps.log.add({ type: 'fall_cancelled', title: 'أُلغي تنبيه السقوط', detail: 'ألغى المستخدم التنبيه خلال مهلة الإلغاء؛ لم يُرسل إشعار.', device: 'wearable' });
    this.setSlow({ fallAlert: { ...fa, state: 'cancelled' } });
  }
  closeFallAlert() {
    this.motion.clearFall();
    this.detector.reset();
    this.setSlow({ fallAlert: null, fallScripted: false, detector: 'monitoring' });
  }

  // ---------- emergency ----------
  triggerEmergency() {
    const mode = this.slow.deliveryMode;
    this.deps.log.add({
      type: 'emergency', title: 'طوارئ تجريبية', severity: 'alert', device: 'wearable', needsReview: true,
      detail: `ضغط على زر الطوارئ التجريبي. هذا اختبار محاكاة ولا يُرسل أي إشعار حقيقي. نتيجة التسليم المحاكاة: ${mode === 'success' ? 'نجاح' : 'فشل'}.`,
    });
    this.setSlow({ lastEmergencyAt: this.deps.now() });
    this.flush();
  }
  retryDelivery(eventId: string) {
    const ev = this.deps.log.all().find((e) => e.id === eventId);
    if (!ev || ev.delivery !== 'failed') return;
    this.deps.log.update(eventId, { delivery: 'pending' });
    this.deps.log.add({ type: 'emergency_retry', title: 'إعادة محاولة إرسال إشعار تجريبي', detail: `إعادة إرسال: ${ev.title}`, device: ev.device === 'local' ? 'wearable' : ev.device });
    this.flush();
  }
  setDeliveryMode(m: 'success' | 'failure') {
    this.setSlow({ deliveryMode: m });
  }

  // ---------- medication ----------
  private makeAlert(name: string, time: string, test: boolean, reminderId: string | null): ActiveAlert {
    const a: ActiveAlert = { id: uid('med'), reminderId, name, time, test, firedAt: this.deps.now(), state: 'ringing' };
    this.deps.log.add({
      type: 'med_reminder', title: `${test ? 'تذكير تجريبي' : 'تذكير'}: ${name}`, detail: `الوقت ${time}.${test ? ' (اختبار فوري)' : ''}`, device: 'robot',
    });
    return a;
  }
  fireTestReminder(name: string, time: string) {
    this.setSlow({ medAlert: this.makeAlert(name, time, true, null) });
    this.flush();
  }
  ackAlert() {
    const a = this.slow.medAlert;
    if (!a || a.state !== 'ringing') return;
    this.deps.log.add({ type: 'med_ack', title: `تم استلام تنبيه «${a.name}»`, detail: 'تأكيد الاستلام لا يعني أن الدواء قد أُخذ.', device: 'robot' });
    this.setSlow({ medAlert: { ...a, state: 'received' } });
    this.flush();
  }
  dismissAlert() {
    const a = this.slow.medAlert;
    if (!a || a.state !== 'ringing') return;
    this.deps.log.add({ type: 'med_dismiss', title: `أُغلق تنبيه «${a.name}» بدون استلام`, detail: 'أُغلق التنبيه التجريبي.', device: 'robot' });
    this.setSlow({ medAlert: { ...a, state: 'dismissed' } });
    this.flush();
  }
  clearAlert() {
    this.setSlow({ medAlert: null });
  }

  // ---------- cloud ----------
  setInternet(up: boolean) {
    if (up === this.slow.internet) return;
    this.setSlow({ internet: up });
    this.deps.log.add({ type: up ? 'internet_up' : 'internet_down', title: up ? 'عاد الاتصال بالإنترنت (محاكاة)' : 'انقطع الإنترنت (محاكاة)', detail: up ? 'ستُزامَن الأحداث المعلّقة.' : 'ستُحفظ الأحداث محليًا بانتظار المزامنة.' });
    if (up) this.syncReconnect();
  }
  setDevice(d: DeviceKey, online: boolean) {
    const key = d === 'robot' ? 'robotCloud' : 'wearableCloud';
    const cur = this.slow[key];
    if (cur.online === online) return;
    const name = d === 'robot' ? 'الروبوت' : 'السوار';
    this.setSlow({ [key]: { online, lastSeen: online && this.slow.internet ? this.deps.now() : cur.lastSeen } } as Partial<SlowState>);
    this.deps.log.add({ type: online ? 'device_online' : 'device_offline', title: online ? `عاد ${name} للاتصال (محاكاة)` : `انقطع اتصال ${name} (محاكاة)`, detail: online ? 'ستُزامَن أحداثه المعلّقة.' : 'ستُخزَّن أحداثه محليًا حتى يعود.' });
    if (online) this.syncReconnect();
  }
  private syncReconnect() {
    const pending = this.deps.log.all().filter((e) => e.delivery === 'pending').length;
    this.flush();
    if (pending > 0 && this.slow.internet) this.deps.log.add({ type: 'sync', title: `مزامنة ${pending} حدث معلّق (محاكاة)`, detail: 'أُقرّت من خادم تجريبي وليس من خادم حقيقي.' });
  }

  /**
   * Simulated delivery: an event leaves "pending" only if the internet and its source device are online.
   * Critical events fail when the simulated outcome is set to failure.
   */
  flush() {
    const s = this.slow;
    const up = (d: LoggedEvent['device']) => d === 'local' || (s.internet && (d === 'robot' ? s.robotCloud.online : s.wearableCloud.online));
    const critical = new Set(['emergency', 'fall_notified', 'emergency_retry']);
    this.deps.log.patchMany((e) => {
      if (e.delivery !== 'pending' || !up(e.device)) return null;
      if (critical.has(e.type) && s.deliveryMode === 'failure') return { delivery: 'failed' };
      return { delivery: 'delivered_sim' };
    });
  }
}

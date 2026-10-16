import test from 'node:test';
import assert from 'node:assert/strict';
import { EventLog } from '../src/eventLog/eventLog';
import { SimEngine, DT, CANCEL_WINDOW_S } from '../src/simulation/engine';
import { addObstacleAhead, initialRobot, senseDistance, setCommand, stepRobot } from '../src/simulation/robot';
import { FallDetector, SyntheticMotion, mag } from '../src/simulation/wearable';
import { dueReminders, validateReminder } from '../src/simulation/medication';
import type { MedReminder } from '../src/types';
import { AppStore } from '../src/store/app';

function make(reminders: MedReminder[] = [], now = () => 1_700_000_000_000) {
  const log = new EventLog(false);
  let list = reminders;
  const e = new SimEngine({ log, now, getReminders: () => list, patchReminder: (id, p) => { list = list.map((r) => (r.id === id ? { ...r, ...p } : r)); } });
  return { e, log, reminders: () => list };
}
const run = (e: SimEngine, sec: number) => { for (let i = 0; i < Math.round(sec / DT); i++) e.advance(); };

test('robot moves forward, turns, and sensor distance reflects an obstacle', () => {
  let r = setCommand(initialRobot(), 'forward');
  const z0 = r.z;
  for (let i = 0; i < 20; i++) r = stepRobot(r, DT).state;
  assert.ok(r.z > z0 + 10);
  const r2 = addObstacleAhead(initialRobot(), 70);
  const d = senseDistance(r2);
  assert.ok(d > 40 && d < 70, `d=${d}`);
  let t = setCommand(initialRobot(), 'right');
  for (let i = 0; i < 20; i++) t = stepRobot(t, DT).state;
  assert.ok(t.heading < 0, 'turning right lowers heading');
});

test('obstacle inside the danger zone stops the robot (stop behaviour) and logs once', () => {
  let r = setCommand(addObstacleAhead(initialRobot(), 60), 'forward');
  let events = 0;
  for (let i = 0; i < 400; i++) {
    const out = stepRobot(r, DT);
    r = out.state;
    events += out.events.length;
  }
  assert.equal(r.mode, 'blocked');
  assert.equal(events, 1);
  assert.ok(r.distance <= r.dangerCm + 1, `distance ${r.distance}`);
  assert.equal(r.motorL, 0);
});

test('avoid behaviour turns away and keeps moving afterwards', () => {
  let r = { ...setCommand(addObstacleAhead(initialRobot(), 60), 'forward'), behavior: 'avoid' as const };
  let avoids = 0;
  for (let i = 0; i < 600; i++) {
    const out = stepRobot(r, DT);
    r = out.state;
    avoids += out.events.filter((e) => e.type === 'obstacle_avoid').length;
  }
  assert.ok(avoids >= 1);
  assert.ok(Math.abs(r.heading) > 0.5);
  assert.notEqual(r.mode, 'blocked');
});

test('synthetic fall is detected by the rule-based detector only after stillness', () => {
  const m = new SyntheticMotion(42);
  const d = new FallDetector();
  let t = 0;
  for (; t < 5; t += DT) {
    const s = m.sample(t);
    assert.ok(mag(s) > 0.5 && mag(s) < 1.6);
    assert.equal(d.feed(s), null);
  }
  m.triggerFall(t);
  let found: number | null = null;
  const t0 = t;
  for (let i = 0; i < 120 && found == null; i++, t += DT) {
    const r = d.feed(m.sample(t));
    if (r) found = t - t0;
  }
  assert.ok(found != null && found > 2.5 && found < 4, `found at ${found}`);
});

test('normal walking never triggers a suspected fall', () => {
  const m = new SyntheticMotion(7);
  const d = new FallDetector();
  for (let t = 0; t < 120; t += DT) assert.equal(d.feed(m.sample(t)), null);
});

test('engine: pause preserves state, stop halts motors and clears the timer', () => {
  const { e } = make();
  e.start();
  assert.equal(e.hasTimer, true);
  e.command('forward');
  run(e, 1);
  const z = e.getFast().robot.z;
  assert.ok(z > -60);
  e.pause();
  assert.equal(e.hasTimer, false);
  run(e, 1); // advance() is ignored while paused
  assert.equal(e.getFast().robot.z, z);
  e.resume();
  assert.equal(e.hasTimer, true);
  run(e, 0.5);
  e.stop();
  assert.equal(e.hasTimer, false);
  assert.equal(e.getSlow().status, 'stopped');
  const r = e.getFast().robot;
  assert.equal(r.motorL, 0);
  assert.equal(r.motorR, 0);
  assert.equal(r.cmd, 'stop');
  const z2 = r.z;
  run(e, 2);
  assert.equal(e.getFast().robot.z, z2);
  e.dispose();
});

test('engine: fall flow -> alert -> cancel, and ignored alert notifies the caregiver (pending until online)', () => {
  const { e, log } = make();
  assert.equal(e.triggerFall().ok, false); // must be running
  e.start();
  run(e, 3);
  assert.equal(e.triggerFall().ok, true);
  run(e, 6);
  assert.equal(e.getSlow().fallAlert?.state, 'pending');
  assert.ok(log.has('fall_suspected'));
  e.cancelFallAlert();
  assert.equal(e.getSlow().fallAlert?.state, 'cancelled');
  assert.ok(log.has('fall_cancelled'));
  assert.ok(!log.has('fall_notified'));
  e.closeFallAlert();

  // second fall, not cancelled; wearable offline -> event stays pending
  e.setDevice('wearable', false);
  assert.equal(e.triggerFall().ok, true);
  run(e, 6 + CANCEL_WINDOW_S + 1);
  assert.equal(e.getSlow().fallAlert?.state, 'notified');
  const n = log.all().find((x) => x.type === 'fall_notified')!;
  assert.equal(n.delivery, 'pending');
  e.setDevice('wearable', true);
  assert.equal(log.all().find((x) => x.id === n.id)!.delivery, 'delivered_sim');
  assert.ok(log.has('sync'));
  e.dispose();
});

test('engine: stopping closes a pending fall alert without notifying', () => {
  const { e, log } = make();
  e.start();
  run(e, 1);
  e.triggerFall();
  run(e, 5);
  assert.equal(e.getSlow().fallAlert?.state, 'pending');
  e.stop();
  assert.equal(e.getSlow().fallAlert?.state, 'cancelled');
  assert.ok(!log.has('fall_notified'));
});

test('emergency: success, failure, retry and offline queueing', () => {
  const { e, log } = make();
  e.triggerEmergency();
  const first = log.all().find((x) => x.type === 'emergency')!;
  assert.equal(first.delivery, 'delivered_sim');
  e.setDeliveryMode('failure');
  e.triggerEmergency();
  const failed = log.all().filter((x) => x.type === 'emergency')[1];
  assert.equal(failed.delivery, 'failed');
  e.setDeliveryMode('success');
  e.retryDelivery(failed.id);
  assert.equal(log.all().find((x) => x.id === failed.id)!.delivery, 'delivered_sim');
  e.setInternet(false);
  e.triggerEmergency();
  const q = log.all().filter((x) => x.type === 'emergency')[2];
  assert.equal(q.delivery, 'pending');
  e.setInternet(true);
  assert.equal(log.all().find((x) => x.id === q.id)!.delivery, 'delivered_sim');
});

test('medication: validation, due logic, test reminder, acknowledgement is not proof of intake', () => {
  assert.ok(validateReminder('', '08:00'));
  assert.ok(validateReminder('x', '25:00'));
  assert.equal(validateReminder('دواء', '08:30'), null);
  const r: MedReminder = { id: 'a', name: 'دواء', time: '08:30', enabled: true };
  const at = new Date(2026, 0, 5, 8, 30, 10);
  assert.equal(dueReminders([r], at).length, 1);
  assert.equal(dueReminders([{ ...r, enabled: false }], at).length, 0);
  assert.equal(dueReminders([{ ...r, lastFiredDay: '2026-01-05' }], at).length, 0);
  const { e, log } = make();
  e.fireTestReminder('أسبرين', '09:00');
  assert.equal(e.getSlow().medAlert?.state, 'ringing');
  e.ackAlert();
  assert.equal(e.getSlow().medAlert?.state, 'received');
  const ack = log.all().find((x) => x.type === 'med_ack')!;
  assert.ok(ack.detail.includes('لا يعني'));
  e.fireTestReminder('x', '09:01');
  e.dismissAlert();
  assert.ok(log.has('med_dismiss'));
});

test('scheduled reminder fires while running at the matching minute, once per day', () => {
  const when = new Date(2026, 0, 5, 8, 30, 0).getTime();
  const { e, log, reminders } = make([{ id: 'r1', name: 'ميتفورمين', time: '08:30', enabled: true }], () => when);
  e.start();
  run(e, 1.2);
  assert.equal(e.getSlow().medAlert?.name, 'ميتفورمين');
  assert.equal(log.all().filter((x) => x.type === 'med_reminder').length, 1);
  assert.ok(reminders()[0].lastFiredDay);
  e.ackAlert();
  run(e, 3);
  assert.equal(log.all().filter((x) => x.type === 'med_reminder').length, 1);
  e.stop();
});

test('cloud: heartbeat, device and internet state, last successful connection', () => {
  const { e } = make();
  e.start();
  run(e, 1.2);
  const seen = e.getSlow().robotCloud.lastSeen;
  assert.ok(seen);
  e.setInternet(false);
  run(e, 2);
  assert.equal(e.getSlow().robotCloud.lastSeen, seen); // no heartbeat without internet
  e.setDevice('robot', false);
  assert.equal(e.getSlow().robotCloud.online, false);
  e.setInternet(true);
  e.setDevice('robot', true);
  assert.equal(e.getSlow().robotCloud.online, true);
  e.dispose();
});

test('resetExperiment returns to the initial state without timers', () => {
  const { e } = make();
  e.start();
  e.addObstacle();
  run(e, 1);
  e.resetExperiment();
  assert.equal(e.hasTimer, false);
  assert.equal(e.getSlow().status, 'stopped');
  assert.equal(e.getFast().robot.obstacles.length, 0);
  assert.equal(e.getSlow().ranOnce, false);
});

test('app store sanitises and persists settings', () => {
  const s = new AppStore(false, { pinmap: { AIN1: 99 as never, AIN2: 14 } as never, wizard: { step: 4, completed: [1, 2, 2] } as never, costs: { esp32: 120, bad: -1 as never } });
  assert.equal(s.get().pinmap.AIN1, 26);
  assert.equal(s.get().pinmap.AIN2, 14);
  assert.deepEqual(s.get().wizard, { step: 4, completed: [1, 2] });
  assert.deepEqual(s.get().costs, { esp32: 120 });
  const r = s.addReminder(' دواء ', '07:15');
  assert.equal(s.get().reminders[0].name, 'دواء');
  s.patchReminder(r.id, { enabled: false });
  assert.equal(s.get().reminders[0].enabled, false);
  s.resetAll();
  assert.equal(s.get().reminders.length, 0);
});

test('event log keeps events, filters by type and can be cleared', () => {
  const log = new EventLog(false);
  log.add({ type: 'system', title: 'a' });
  const e = log.add({ type: 'emergency', title: 'b', device: 'wearable' });
  assert.equal(e.delivery, 'pending');
  assert.equal(log.all().length, 2);
  assert.ok(log.has(['emergency']));
  log.clear();
  assert.equal(log.all().length, 0);
});

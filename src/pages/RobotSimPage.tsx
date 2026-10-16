import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Square } from 'lucide-react';
import { Viewport } from '../engine/Viewport';
import { buildRobotScene } from '../scenes/robot3d';
import { SimControls } from '../components/SimControls';
import { Badge, Card, Metric, Seg } from '../components/ui';
import { sim } from '../simulation/instance';
import { useFast, useSlow } from '../store/hooks';
import type { Cmd } from '../simulation/robot';

const MODE_LABEL: Record<string, string> = { idle: 'ساكن', manual: 'قيادة', avoiding: 'يتفادى عائقًا', blocked: 'توقف أمام عائق' };

export default function RobotSimPage() {
  const slow = useSlow();
  const { robot: r } = useFast();
  const [cone, setCone] = useState(true);
  const running = slow.status === 'running';
  const scene = useMemo(() => buildRobotScene(r, cone), [r, cone]);

  useEffect(() => {
    const map: Record<string, Cmd> = { ArrowUp: 'forward', ArrowDown: 'backward', ArrowLeft: 'left', ArrowRight: 'right', ' ': 'stop' };
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
      const c = map[e.key];
      if (!c || sim.getSlow().status !== 'running') return;
      e.preventDefault();
      sim.command(c);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const cmd = (c: Cmd, label: string, icon: React.ReactNode, cls?: string) => (
    <button className={cls} aria-label={label} data-tip={label} aria-pressed={r.cmd === c} disabled={!running} onClick={() => sim.command(c)}>{icon}</button>
  );
  const danger = r.distance <= r.dangerCm;

  return (
    <div className="stack">
      <Card pad={false}><div className="card-b"><SimControls /></div></Card>
      <div className="simgrid">
        <div className="stack">
          <div className="simview">
            <Viewport scene={scene} view={{ yaw: 0.35, pitch: 0.95, dist: 300, target: [0, 0, 0] }} viewKey="robot-sim" label="أرضية محاكاة الروبوت (بيانات تركيبية)" height="100%" />
          </div>
          {!running ? <div className="note">المحاكاة {slow.status === 'paused' ? 'متوقفة مؤقتًا' : 'متوقفة'}؛ اضغط «تشغيل» لتفعيل القيادة والحساس. كل القيم هنا محاكاة وليست من عتاد حقيقي.</div> : null}
        </div>
        <div className="stack">
          <Card title="القياسات (محاكاة)">
            <div className="grid2" style={{ gap: 8 }}>
              <Metric label="مسافة الحساس (سم)" value={r.distance >= 400 ? '≥400' : r.distance.toFixed(0)} tone={danger ? 'bad' : undefined} />
              <Metric label="حالة الروبوت" value={<span style={{ fontFamily: 'inherit', fontSize: 15 }}>{MODE_LABEL[r.mode]}</span>} />
              <Metric label="المحرك الأيسر" value={`${Math.round(r.motorL * 100)}%`} />
              <Metric label="المحرك الأيمن" value={`${Math.round(r.motorR * 100)}%`} />
            </div>
            {danger ? <div className="note bad" role="alert" style={{ marginTop: 10 }}>عائق داخل منطقة الخطر ({r.dangerCm} سم).</div> : null}
          </Card>
          <Card title="التحكم">
            <div className="stack">
              <div className="dpad" role="group" aria-label="أسهم القيادة">
                <span />{cmd('forward', 'للأمام', <ArrowUp size={22} />)}<span />
                {cmd('left', 'يسارًا', <ArrowLeft size={22} />)}{cmd('stop', 'توقف', <Square size={20} />, 'stop')}{cmd('right', 'يمينًا', <ArrowRight size={22} />)}
                <span />{cmd('backward', 'للخلف', <ArrowDown size={22} />)}<span />
              </div>
              <div className="small muted">لوحة المفاتيح: الأسهم للقيادة، المسافة للتوقف.</div>
              <div className="field"><label htmlFor="spd">السرعة: {r.speedPct}%</label><input id="spd" type="range" min={10} max={100} step={10} value={r.speedPct} onChange={(e) => sim.setSpeed(Number(e.target.value))} /></div>
              <div className="field"><label htmlFor="dng">مسافة منطقة الخطر: {r.dangerCm} سم</label><input id="dng" type="range" min={10} max={100} step={5} value={r.dangerCm} onChange={(e) => sim.setDanger(Number(e.target.value))} /></div>
              <div className="row"><span className="small">سلوك الحساس:</span>
                <Seg<'stop' | 'avoid'> label="السلوك" value={r.behavior} onChange={(v) => sim.setBehavior(v)} options={[{ value: 'stop', label: 'توقف' }, { value: 'avoid', label: 'تفادٍ' }]} /></div>
              <label className="check"><input type="checkbox" checked={r.patrol} disabled={!running} onChange={(e) => sim.setPatrol(e.target.checked)} /> <span>جولة تلقائية للأمام (ينفّذ السلوك المختار عند العائق)</span></label>
              <label className="check"><input type="checkbox" checked={cone} onChange={(e) => setCone(e.target.checked)} /> <span>إظهار مخروط الحساس ومنطقة الخطر</span></label>
              <div className="row">
                <button className="btn" onClick={() => sim.addObstacle()}>إضافة عائق أمام الروبوت</button>
                <button className="btn" disabled={r.obstacles.length === 0} onClick={() => sim.clearObstacles()}>إزالة العوائق</button>
              </div>
              <div className="small muted">العوائق: {r.obstacles.length}. الحساس المحاكى بمدى 400 سم وزاوية ±7.5° (تقريب لـ HC-SR04).</div>
            </div>
          </Card>
          <Badge tone="warn">وضع المحاكاة — لا اتصال بعتاد</Badge>
        </div>
      </div>
    </div>
  );
}

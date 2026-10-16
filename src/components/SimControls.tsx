import { useState } from 'react';
import { Pause, Play, RefreshCcw, RotateCcw, Square } from 'lucide-react';
import { sim } from '../simulation/instance';
import { useSlow } from '../store/hooks';
import { Badge, ConfirmModal } from './ui';

const STATUS: Record<string, { label: string; tone: 'ok' | 'warn' | 'neutral' }> = {
  running: { label: 'يعمل', tone: 'ok' },
  paused: { label: 'متوقف مؤقتًا', tone: 'warn' },
  stopped: { label: 'متوقف', tone: 'neutral' },
};

/** Shared run controls: Run / Pause / Resume / Full stop / Restart / Reset experiment. */
export function SimControls() {
  const s = useSlow();
  const [confirm, setConfirm] = useState(false);
  const st = STATUS[s.status];
  return (
    <div className="row" role="group" aria-label="التحكم في المحاكاة">
      <Badge tone={st.tone}>الحالة: {st.label}</Badge>
      {s.status === 'stopped' ? (
        <button className="btn primary" onClick={() => sim.start()}><Play size={16} /> تشغيل</button>
      ) : s.status === 'running' ? (
        <button className="btn" onClick={() => sim.pause()}><Pause size={16} /> إيقاف مؤقت</button>
      ) : (
        <button className="btn primary" onClick={() => sim.resume()}><Play size={16} /> استكمال</button>
      )}
      <button className="btn danger" disabled={s.status === 'stopped'} onClick={() => sim.stop()} data-tip="يوقف المحركات والمؤقتات ويعيد المحاكي لحالة آمنة"><Square size={16} /> إيقاف كامل</button>
      <button className="btn" onClick={() => sim.restart()}><RotateCcw size={16} /> إعادة التشغيل</button>
      <button className="btn" onClick={() => setConfirm(true)}><RefreshCcw size={16} /> إعادة ضبط التجربة</button>
      {confirm ? (
        <ConfirmModal title="إعادة ضبط التجربة؟" text="سيعود الروبوت لموضعه الأول وتُزال العوائق ويُعاد ضبط حالة الاتصال المحاكى. سجل الأحداث لن يتأثر." confirmLabel="إعادة الضبط" onConfirm={() => sim.resetExperiment()} onClose={() => setConfirm(false)} />
      ) : null}
    </div>
  );
}

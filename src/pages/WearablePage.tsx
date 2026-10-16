import { useEffect, useMemo, useState } from 'react';
import { SimControls } from '../components/SimControls';
import { Badge, Card, Metric, ProgressBar, Seg } from '../components/ui';
import { sim, } from '../simulation/instance';
import { useEvents, useFast, useSlow } from '../store/hooks';
import { CANCEL_WINDOW_S } from '../simulation/engine';
import { RULES, gyroMag, mag, type DetectorState } from '../simulation/wearable';
import { fmtTime } from '../utilities/rng';
import { useToast } from '../components/toast';
import { AlertTriangle, Siren } from 'lucide-react';

const DET: Record<DetectorState, string> = { monitoring: 'مراقبة', freefall: 'سقوط حر محتمل', impact: 'ارتطام محتمل', suspected: 'اشتباه في سقوط' };

function Chart({ values, lines, min, max, color, label }: { values: number[]; lines: { y: number; text: string }[]; min: number; max: number; color: string; label: string }) {
  const W = 400, H = 130;
  const y = (v: number) => H - 8 - ((Math.min(max, Math.max(min, v)) - min) / (max - min)) * (H - 16);
  const pts = values.map((v, i) => `${(i / Math.max(1, 159)) * W},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} preserveAspectRatio="none">
      {lines.map((l) => (
        <g key={l.text}>
          <line x1="0" x2={W} y1={y(l.y)} y2={y(l.y)} stroke="rgba(255,179,71,.6)" strokeDasharray="4 4" />
        </g>
      ))}
      {values.length > 1 ? <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" /> : null}
    </svg>
  );
}

export default function WearablePage() {
  const slow = useSlow();
  const { samples } = useFast();
  const events = useEvents();
  const toast = useToast();
  const running = slow.status === 'running';
  const fa = slow.fallAlert;
  const last = samples[samples.length - 1];
  const accel = useMemo(() => samples.map(mag), [samples]);
  const gyro = useMemo(() => samples.map(gyroMag), [samples]);
  const [sosNote, setSosNote] = useState(false);
  useEffect(() => {
    if (!sosNote) return;
    const t = window.setTimeout(() => setSosNote(false), 5000);
    return () => window.clearTimeout(t);
  }, [sosNote]);
  const lastEmergency = [...events].reverse().find((e) => e.type === 'emergency');

  return (
    <div className="stack">
      <Card pad={false}><div className="card-b"><SimControls /></div></Card>
      <div className="note warn">بيانات حساس MPU6050 هنا <b>تركيبية</b> مولّدة بالمحاكاة. كاشف السقوط قائم على قواعد بسيطة وشفافة وليس مُثبتًا سريريًا، ولا يُغني عن الرعاية الفعلية.</div>
      <div className="grid2" style={{ alignItems: 'start' }}>
        <Card title="تيار الحساس (محاكاة)">
          <div className="stack">
            <div className="grid3" style={{ gap: 8 }}>
              <Metric label="التسارع (g)" value={last ? mag(last).toFixed(2) : '—'} />
              <Metric label="الدوران (°/ث)" value={last ? gyroMag(last).toFixed(0) : '—'} />
              <Metric label="حالة الكاشف" value={<span style={{ fontFamily: 'inherit', fontSize: 14 }}>{DET[slow.detector]}</span>} tone={slow.detector === 'suspected' ? 'bad' : undefined} />
            </div>
            <div><div className="small muted">مقدار التسارع |a| بوحدة g — خط 0.5 للسقوط الحر وخط 2.5 للارتطام</div>
              <Chart values={accel} min={0} max={4} color="#00D9FF" label="رسم مقدار التسارع" lines={[{ y: RULES.freeFallG, text: '0.5g' }, { y: RULES.impactG, text: '2.5g' }]} /></div>
            <div><div className="small muted">مقدار الدوران بوحدة °/ث</div>
              <Chart values={gyro} min={0} max={400} color="#087FF5" label="رسم مقدار الدوران" lines={[{ y: RULES.stillGyro, text: '40°/ث' }]} /></div>
            {!running ? <div className="empty">لا بيانات: شغّل المحاكاة لبدء التيار.</div> : null}
          </div>
        </Card>
        <div className="stack">
          <Card title="اختبار السقوط">
            <div className="stack">
              <div className="small muted">القاعدة: سقوط حر (&lt;{RULES.freeFallG}g) ← ارتطام (&gt;{RULES.impactG}g خلال {RULES.impactWindowS} ث) ← سكون ≥ {RULES.stillHoldS} ث بميلان &gt; {RULES.tiltDeg}°.</div>
              <button className="btn primary" onClick={() => { const r = sim.triggerFall(); r.ok ? toast.info(r.message) : toast.bad(r.message); }}><AlertTriangle size={16} /> تشغيل سقوط تركيبي</button>
              {fa ? (
                <div className={`alertbox fall`} role="alert">
                  {fa.state === 'pending' ? (
                    <>
                      <b>اشتباه في سقوط — سيُرسل إشعار للمرافق بعد {Math.ceil(fa.remaining)} ث</b>
                      <ProgressBar value={(fa.remaining / CANCEL_WINDOW_S) * 100} />
                      <div className="small">{fa.reason}</div>
                      <div className="row"><button className="btn primary" onClick={() => sim.cancelFallAlert()}>أنا بخير — إلغاء التنبيه</button></div>
                    </>
                  ) : fa.state === 'cancelled' ? (
                    <><b>أُلغي التنبيه</b><div className="small">لم يُرسل أي إشعار للمرافق.</div><button className="btn" onClick={() => sim.closeFallAlert()}>إغلاق</button></>
                  ) : (
                    <><b>أُرسل إشعار للمرافق (محاكاة)</b><div className="small">سُجل في سجل الأحداث وينتظر مراجعة المرافق في Care Twin.</div><button className="btn" onClick={() => sim.closeFallAlert()}>إغلاق</button></>
                  )}
                </div>
              ) : null}
            </div>
          </Card>
          <Card title="زر الطوارئ التجريبي">
            <div className="stack">
              <button className="sos" onClick={() => { sim.triggerEmergency(); setSosNote(true); }}><Siren size={28} /> طوارئ تجريبية</button>
              <div className="row"><span className="small">نتيجة التسليم المحاكى:</span>
                <Seg<'success' | 'failure'> label="نتيجة التسليم" value={slow.deliveryMode} onChange={(v) => sim.setDeliveryMode(v)} options={[{ value: 'success', label: 'نجاح' }, { value: 'failure', label: 'فشل' }]} /></div>
              {sosNote ? <div className="note" role="status">سُجّلت طوارئ تجريبية. لا يُرسل أي إشعار حقيقي.</div> : null}
              {lastEmergency ? (
                <div className="small">آخر طوارئ تجريبية {fmtTime(lastEmergency.ts)} —{' '}
                  {lastEmergency.delivery === 'delivered_sim' ? <Badge tone="ok">سُلّمت (محاكاة)</Badge> : lastEmergency.delivery === 'failed' ? <><Badge tone="bad">فشل التسليم</Badge> <button className="btn sm" onClick={() => sim.retryDelivery(lastEmergency.id)}>إعادة المحاولة</button></> : <Badge tone="warn">بانتظار الاتصال</Badge>}
                </div>
              ) : null}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

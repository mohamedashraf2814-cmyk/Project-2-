import { useMemo } from 'react';
import { SimControls } from '../components/SimControls';
import { Badge, Card, Metric } from '../components/ui';
import { sim } from '../simulation/instance';
import { eventLog } from '../eventLog/eventLog';
import { useEvents, useFast, useSlow } from '../store/hooks';
import { fmtDateTime, fmtTime } from '../utilities/rng';
import type { Delivery } from '../types';

export type TwinState = 'normal' | 'review' | 'fall' | 'sos' | 'off' | 'nodata';
export const TWIN_LABEL: Record<TwinState, string> = {
  normal: 'طبيعي', review: 'يحتاج مراجعة', fall: 'اشتباه في سقوط', sos: 'طوارئ تجريبية', off: 'غير متصل', nodata: 'بيانات غير متاحة',
};
const PILL: Record<TwinState, string> = { normal: 'normal', review: 'review', fall: 'fall', sos: 'sos', off: 'off', nodata: 'off' };
export const DELIVERY_LABEL: Record<Delivery, string> = { local: 'محلي فقط', pending: 'بانتظار الخادم', delivered_sim: 'أقرّه خادم تجريبي', failed: 'فشل التسليم' };

/** Never reports "normal" without a live heartbeat: a stopped/paused sim or offline device is shown as such. */
export function deriveTwinState(o: { status: string; internet: boolean; robotOnline: boolean; wearableOnline: boolean; fall: string | null; unreviewedEmergency: boolean; needsReview: boolean }): TwinState {
  if (o.unreviewedEmergency) return 'sos';
  if (o.fall === 'pending' || o.fall === 'notified') return 'fall';
  if (!o.internet || !o.wearableOnline) return 'off';
  if (o.status !== 'running') return 'nodata';
  if (o.needsReview) return 'review';
  return 'normal';
}

export default function CareTwinPage() {
  const slow = useSlow();
  const { robot } = useFast();
  const events = useEvents();
  const unreviewed = events.filter((e) => e.needsReview && !e.reviewed);
  const state = deriveTwinState({
    status: slow.status, internet: slow.internet, robotOnline: slow.robotCloud.online, wearableOnline: slow.wearableCloud.online,
    fall: slow.fallAlert?.state ?? null, unreviewedEmergency: unreviewed.some((e) => e.type === 'emergency'),
    needsReview: unreviewed.length > 0,
  });
  const pending = events.filter((e) => e.delivery === 'pending').length;
  const failed = events.filter((e) => e.delivery === 'failed').length;
  const recent = useMemo(() => events.slice(-10).reverse(), [events]);
  const dev = (label: string, on: boolean, last: number | null) => (
    <div className="status-tile">
      <b>{label}</b>
      <Badge tone={on && slow.internet ? 'ok' : 'bad'}>{on && slow.internet ? 'متصل (محاكاة)' : 'غير متصل'}</Badge>
      <span className="small muted">آخر اتصال: {last ? fmtDateTime(last) : 'لا يوجد'}</span>
    </div>
  );
  const sx = (x: number) => 160 + (x / 140) * 150;
  const sy = (z: number) => 110 - (z / 100) * 100;

  return (
    <div className="stack">
      <Card pad={false}><div className="card-b"><SimControls /></div></Card>
      <div className="note warn">لوحة Care Twin تعرض بيانات <b>تركيبية</b> من المحاكاة. لا تتبّع حقيقي لأي شخص، والبطارية والخريطة محاكاة.</div>
      <div className="grid2" style={{ alignItems: 'start' }}>
        <div className="stack">
          <Card title="الحالة العامة">
            <div className="stack">
              <span className={`state-pill ${PILL[state]}`} role="status">{TWIN_LABEL[state]}</span>
              <div className="small muted">
                {state === 'nodata' ? 'المحاكاة غير شغّالة فلا توجد نبضات اتصال؛ غياب البيانات لا يعني أن الوضع آمن.' : null}
                {state === 'off' ? 'الاتصال مقطوع؛ لا تُعد هذه الحالة آمنة. الأحداث تُخزَّن محليًا بانتظار الاتصال.' : null}
                {state === 'normal' ? 'نبض الاتصال المحاكى موجود ولا توجد تنبيهات تحتاج مراجعة.' : null}
                {state === 'review' ? `يوجد ${unreviewed.length} حدث يحتاج مراجعة.` : null}
                {state === 'fall' ? 'اشتباه في سقوط تركيبي — راجع تفاصيله في السجل.' : null}
                {state === 'sos' ? 'ضغط تجريبي على زر الطوارئ لم تتم مراجعته.' : null}
              </div>
            </div>
          </Card>
          <div className="grid2">
            {dev('الروبوت', slow.robotCloud.online, slow.robotCloud.lastSeen)}
            {dev('السوار', slow.wearableCloud.online, slow.wearableCloud.lastSeen)}
          </div>
          <Card title="البطارية (محاكاة)">
            <div className="grid2" style={{ gap: 8 }}>
              <Metric label="بطارية الروبوت — محاكاة" value={`${Math.round(slow.battery.robot)}%`} />
              <Metric label="بطارية السوار — محاكاة" value={`${Math.round(slow.battery.wearable)}%`} />
            </div>
          </Card>
          <Card title="اتصال السحابة (محاكاة)">
            <div className="stack">
              <div className="row">
                <label className="check"><input type="checkbox" checked={slow.internet} onChange={(e) => sim.setInternet(e.target.checked)} /><span>الإنترنت متاح</span></label>
                <label className="check"><input type="checkbox" checked={slow.robotCloud.online} onChange={(e) => sim.setDevice('robot', e.target.checked)} /><span>الروبوت متصل</span></label>
                <label className="check"><input type="checkbox" checked={slow.wearableCloud.online} onChange={(e) => sim.setDevice('wearable', e.target.checked)} /><span>السوار متصل</span></label>
              </div>
              <div className="grid3" style={{ gap: 8 }}>
                <Metric label="أحداث معلّقة" value={pending} tone={pending ? 'warn' : undefined} />
                <Metric label="فشل التسليم" value={failed} tone={failed ? 'bad' : undefined} />
                <Metric label="تحتاج مراجعة" value={unreviewed.length} tone={unreviewed.length ? 'warn' : undefined} />
              </div>
              <div className="small muted">«أقرّه خادم تجريبي» يعني تسليمًا محاكى وليس خادمًا حقيقيًا.</div>
            </div>
          </Card>
        </div>
        <div className="stack">
          <Card title="خريطة المنزل (محاكاة)">
            <svg className="homemap" viewBox="0 0 320 220" role="img" aria-label="خريطة منزل تركيبية تظهر موضع الروبوت المحاكى">
              <rect x="10" y="10" width="300" height="200" rx="6" fill="none" stroke="#2A4673" strokeWidth="2" />
              <line x1="170" y1="10" x2="170" y2="120" stroke="#2A4673" strokeWidth="2" /><line x1="10" y1="120" x2="310" y2="120" stroke="#2A4673" strokeWidth="2" />
              <text x="20" y="30" fontSize="11" fill="#8FA3C0">غرفة المعيشة</text><text x="180" y="30" fontSize="11" fill="#8FA3C0">غرفة النوم</text><text x="20" y="140" fontSize="11" fill="#8FA3C0">المطبخ</text><text x="180" y="140" fontSize="11" fill="#8FA3C0">الممر</text>
              <circle cx={sx(robot.x)} cy={sy(robot.z) + 55} r="7" fill="#00D9FF" /><text x={sx(robot.x) + 10} y={sy(robot.z) + 58} fontSize="10" fill="#00D9FF">الروبوت (محاكاة)</text>
            </svg>
            <div className="small muted" style={{ marginTop: 6 }}>الخريطة توضيحية؛ لا تعرض موقع أي شخص.</div>
          </Card>
          <Card title="آخر الأحداث" pad={false}>
            <div className="card-b">
              {recent.length === 0 ? <div className="empty">لا أحداث بعد. شغّل المحاكاة أو جرّب الأوضاع الأخرى.</div> : (
                <ul className="timeline">
                  {recent.map((e) => (
                    <li key={e.id}>
                      <span className="mono muted small">{fmtTime(e.ts)}</span>
                      <span className={`tdot ${e.severity === 'alert' ? 'alert' : e.severity === 'review' ? 'review' : 'info'}`} aria-hidden="true" />
                      <div><b>{e.title}</b>
                        <div className="small muted">{DELIVERY_LABEL[e.delivery]}{e.needsReview ? (e.reviewed ? ' — روجع' : ' — يحتاج مراجعة') : ''}</div>
                        {e.needsReview && !e.reviewed ? <button className="btn sm" onClick={() => eventLog.update(e.id, { reviewed: true })}>تمت المراجعة</button> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

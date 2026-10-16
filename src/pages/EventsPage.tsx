import { useMemo, useState } from 'react';
import { Download, Trash2 } from 'lucide-react';
import { Badge, Card, ConfirmModal, Seg } from '../components/ui';
import { eventLog } from '../eventLog/eventLog';
import { useEvents } from '../store/hooks';
import { sim } from '../simulation/instance';
import { fmtDateTime } from '../utilities/rng';
import { DELIVERY_LABEL } from './CareTwinPage';
import { useToast } from '../components/toast';

type F = 'all' | 'review' | 'pending' | 'failed';

export default function EventsPage() {
  const events = useEvents();
  const toast = useToast();
  const [f, setF] = useState<F>('all');
  const [q, setQ] = useState('');
  const [confirm, setConfirm] = useState(false);
  const list = useMemo(
    () => [...events].reverse().filter((e) => (f === 'all' || (f === 'review' ? e.needsReview && !e.reviewed : e.delivery === f)) && (!q || (e.title + e.detail).includes(q))),
    [events, f, q],
  );
  const exportJson = () => {
    try {
      const blob = new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'ssn-events-simulated.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch {
      toast.bad('تعذّر التصدير في هذا المتصفح.');
    }
  };
  return (
    <div className="stack">
      <div className="note">كل الأحداث الظاهرة ناتجة عن المحاكاة. «محلي فقط» لا يحتاج خادمًا، و«أقرّه خادم تجريبي» تسليم محاكى.</div>
      <Card pad={false}>
        <div className="card-b row" style={{ justifyContent: 'space-between' }}>
          <div className="row">
            <Seg<F> label="تصفية" value={f} onChange={setF} options={[{ value: 'all', label: 'الكل' }, { value: 'review', label: 'تحتاج مراجعة' }, { value: 'pending', label: 'معلّقة' }, { value: 'failed', label: 'فاشلة' }]} />
            <label className="sr" htmlFor="eq">بحث في الأحداث</label>
            <input id="eq" className="input" type="search" placeholder="بحث…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 200 }} />
          </div>
          <div className="row">
            <span className="small muted">{list.length} من {events.length}</span>
            <button className="btn" disabled={!events.length} onClick={exportJson}><Download size={16} /> تصدير JSON</button>
            <button className="btn danger" disabled={!events.length} onClick={() => setConfirm(true)}><Trash2 size={16} /> مسح السجل</button>
          </div>
        </div>
      </Card>
      <Card pad={false}>
        {list.length === 0 ? <div className="card-b"><div className="empty">{events.length ? 'لا أحداث مطابقة للتصفية.' : 'السجل فارغ. شغّل المحاكاة لتظهر الأحداث هنا.'}</div></div> : (
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>الوقت</th><th>الحدث</th><th>التفاصيل</th><th>المصدر</th><th>التسليم</th><th></th></tr></thead>
              <tbody>
                {list.map((e) => (
                  <tr key={e.id}>
                    <td className="mono">{fmtDateTime(e.ts)}</td>
                    <td><b>{e.title}</b></td>
                    <td className="muted">{e.detail}</td>
                    <td>{e.device === 'robot' ? 'الروبوت' : e.device === 'wearable' ? 'السوار' : 'محلي'}</td>
                    <td><Badge tone={e.delivery === 'delivered_sim' ? 'ok' : e.delivery === 'failed' ? 'bad' : e.delivery === 'pending' ? 'warn' : 'neutral'}>{DELIVERY_LABEL[e.delivery]}</Badge></td>
                    <td>
                      {e.delivery === 'failed' ? <button className="btn sm" onClick={() => sim.retryDelivery(e.id)}>إعادة المحاولة</button> : null}
                      {e.needsReview && !e.reviewed ? <button className="btn sm" onClick={() => eventLog.update(e.id, { reviewed: true })}>تمت المراجعة</button> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {confirm ? <ConfirmModal title="مسح سجل الأحداث؟" text="سيُحذف السجل من هذا المتصفح، وقد تُقفل المرحلة 12 لأنها تعتمد على اختبارات مسجلة." confirmLabel="مسح السجل" onConfirm={() => { eventLog.clear(); toast.info('تم مسح السجل.'); }} onClose={() => setConfirm(false)} /> : null}
    </div>
  );
}

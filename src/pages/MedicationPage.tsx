import { useEffect, useRef, useState } from 'react';
import { Bell, Check, Trash2, Volume2, X } from 'lucide-react';
import { SimControls } from '../components/SimControls';
import { Badge, Card } from '../components/ui';
import { useToast } from '../components/toast';
import { app } from '../store/app';
import { useApp, useEvents, useSlow } from '../store/hooks';
import { sim } from '../simulation/instance';
import { validateReminder } from '../simulation/medication';
import { beep, soundAvailable, speak, stopSpeech } from '../utilities/audio';
import { fmtTime } from '../utilities/rng';

export default function MedicationPage() {
  const data = useApp();
  const slow = useSlow();
  const events = useEvents();
  const toast = useToast();
  const [name, setName] = useState('');
  const [time, setTime] = useState('08:00');
  const [err, setErr] = useState<string | null>(null);
  const alert = slow.medAlert;
  const ringing = alert?.state === 'ringing';
  const snd = useRef<number | null>(null);
  const canSound = soundAvailable();
  const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;

  // sound/speech only while an alert is ringing; always cleaned up
  useEffect(() => {
    if (!ringing || !alert) return;
    const play = () => {
      if (data.prefs.sound) beep(880, 260);
    };
    play();
    if (data.prefs.speech) speak(`تذكير بالدواء: ${alert.name}`);
    snd.current = window.setInterval(play, 2000);
    return () => {
      if (snd.current) window.clearInterval(snd.current);
      snd.current = null;
      stopSpeech();
    };
  }, [ringing, alert?.id, data.prefs.sound, data.prefs.speech]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = () => {
    const e = validateReminder(name, time);
    setErr(e);
    if (e) return;
    app.addReminder(name, time);
    setName('');
    toast.ok('أُضيف التذكير.');
  };
  const hist = events.filter((e) => e.type === 'med_reminder' || e.type === 'med_ack' || e.type === 'med_dismiss').slice(-12).reverse();

  return (
    <div className="stack">
      <Card pad={false}><div className="card-b"><SimControls /></div></Card>
      <div className="note">التذكيرات تعمل داخل المحاكاة فقط وأثناء تشغيلها. «تم الاستلام» يعني أن المستخدم رأى التنبيه، <b>ولا يعني أن الدواء قد أُخذ</b>. هذه الأداة ليست جهازًا طبيًا.</div>
      {alert && alert.state !== 'dismissed' ? (
        <div className="alertbox med" role="alert">
          <div className="row"><Bell size={20} /><b>{alert.test ? 'تذكير تجريبي' : 'تذكير دواء'}: {alert.name}</b><Badge tone={alert.state === 'ringing' ? 'info' : 'ok'}>{alert.state === 'ringing' ? 'يرن' : 'تم استلام التنبيه'}</Badge></div>
          <div className="small">الوقت {alert.time}. {!canSound && data.prefs.sound ? 'الصوت غير متاح في هذا المتصفح — اعتمد على التنبيه المرئي.' : ''}</div>
          {alert.state === 'ringing' ? (
            <div className="row"><button className="btn primary" onClick={() => sim.ackAlert()}><Check size={16} /> تم استلام التنبيه</button><button className="btn" onClick={() => sim.dismissAlert()}><X size={16} /> إغلاق بدون استلام</button></div>
          ) : (
            <div className="row"><span className="small">لم يُسجَّل أن الدواء أُخذ.</span><button className="btn sm" onClick={() => sim.clearAlert()}>إخفاء</button></div>
          )}
        </div>
      ) : null}
      <div className="grid2" style={{ alignItems: 'start' }}>
        <Card title="إضافة تذكير">
          <div className="stack">
            <div className="field"><label htmlFor="mn">اسم الدواء</label><input id="mn" className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="مثال: دواء الصباح" /></div>
            <div className="field"><label htmlFor="mt">الوقت</label><input id="mt" className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ maxWidth: 160 }} /></div>
            {err ? <div className="note bad" role="alert">{err}</div> : null}
            <div className="row">
              <button className="btn primary" onClick={add}>إضافة التذكير</button>
              <button className="btn" disabled={slow.status === 'stopped'} onClick={() => sim.fireTestReminder(name.trim() || 'دواء تجريبي', time)} data-tip={slow.status === 'stopped' ? 'شغّل المحاكاة أولًا' : undefined}><Volume2 size={16} /> اختبار الآن</button>
            </div>
            <div className="row">
              <label className="check"><input type="checkbox" checked={data.prefs.sound} onChange={(e) => app.set({ prefs: { ...data.prefs, sound: e.target.checked } })} /><span>صوت التنبيه {canSound ? '' : '(غير متاح)'}</span></label>
              <label className="check"><input type="checkbox" checked={data.prefs.speech} disabled={!canSpeak} onChange={(e) => app.set({ prefs: { ...data.prefs, speech: e.target.checked } })} /><span>نطق التنبيه {canSpeak ? '' : '(غير متاح)'}</span></label>
            </div>
          </div>
        </Card>
        <Card title={`التذكيرات (${data.reminders.length})`} pad={false}>
          {data.reminders.length === 0 ? <div className="card-b"><div className="empty">لا توجد تذكيرات بعد. أضف أول تذكير من النموذج.</div></div> : (
            <div className="card-b stack" style={{ gap: 8 }}>
              {data.reminders.map((r) => (
                <div key={r.id} className="row" style={{ justifyContent: 'space-between', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 12 }}>
                  <div><b>{r.name}</b> <span className="mono muted">{r.time}</span></div>
                  <div className="row">
                    <label className="check"><input type="checkbox" checked={r.enabled} onChange={(e) => app.patchReminder(r.id, { enabled: e.target.checked })} /><span>مفعّل</span></label>
                    <button className="btn icon sm" aria-label={`حذف ${r.name}`} onClick={() => app.removeReminder(r.id)}><Trash2 size={15} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
      <Card title="سجل التذكيرات الأخير" pad={false}>
        <div className="card-b">
          {hist.length === 0 ? <div className="empty">لا أحداث دواء بعد.</div> : (
            <ul className="tight">{hist.map((e) => <li key={e.id}><span className="mono muted">{fmtTime(e.ts)}</span> — {e.title}</li>)}</ul>
          )}
        </div>
      </Card>
    </div>
  );
}

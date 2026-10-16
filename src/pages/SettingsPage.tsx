import { useState } from 'react';
import { Card, ConfirmModal, Badge } from '../components/ui';
import { PARTS } from '../data/parts';
import { DEFAULT_PINMAP, SIGNALS, validatePinMap } from '../data/gpio';
import { app } from '../store/app';
import { useApp } from '../store/hooks';
import { sim } from '../simulation/instance';
import { useToast } from '../components/toast';
import type { SignalKey } from '../types';

export default function SettingsPage() {
  const data = useApp();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const report = validatePinMap(data.pinmap);
  const total = PARTS.reduce((s, p) => s + (data.costs[p.id] ?? 0), 0);
  const entered = PARTS.filter((p) => data.costs[p.id] != null).length;
  const setPin = (k: SignalKey, v: string) => {
    const n = Number(v);
    if (v === '' || !Number.isInteger(n) || n < 0 || n > 48) return;
    app.set({ pinmap: { ...data.pinmap, [k]: n } });
  };
  const num = (key: 'motorStallA' | 'motorVoltage', v: string) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return;
    app.set({ electrical: { ...data.electrical, [key]: n } });
  };
  return (
    <div className="stack">
      <Card title="خريطة دبابيس ESP32 (قابلة للتعديل)">
        <div className="note" style={{ marginBottom: 10 }}>الأرقام اقتراح لوحة ESP32 DevKit V1. أي تغيير يُعاد فحصه فورًا، ويُبطل اعتماد التوصيلات المتأثرة.</div>
        {report.hasFail ? <div className="note bad" role="alert" style={{ marginBottom: 10 }}>توجد مخالفات في الخريطة؛ التوصيلات المتأثرة لن تُعرض كصحيحة.</div> : null}
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>الإشارة</th><th>GPIO</th><th>الفحص</th></tr></thead>
            <tbody>
              {SIGNALS.map((s) => {
                const r = report.perSignal[s.key];
                return (
                  <tr key={s.key}>
                    <td><label htmlFor={`pin-${s.key}`}>{s.label}</label></td>
                    <td><input id={`pin-${s.key}`} className="input mono" type="number" min={0} max={48} value={data.pinmap[s.key]} onChange={(e) => setPin(s.key, e.target.value)} style={{ width: 84 }} /></td>
                    <td><Badge tone={r.status === 'ok' ? 'ok' : r.status === 'fail' ? 'bad' : 'warn'}>{r.status === 'ok' ? 'سليم' : r.status === 'fail' ? 'مخالفة' : 'تنبيه'}</Badge> <span className="small muted">{r.reason}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="row" style={{ marginTop: 10 }}><button className="btn" onClick={() => { app.set({ pinmap: DEFAULT_PINMAP }); toast.info('أُعيدت الخريطة الافتراضية.'); }}>استعادة الخريطة الافتراضية</button></div>
      </Card>
      <div className="grid2" style={{ alignItems: 'start' }}>
        <Card title="الإعدادات الكهربائية للفحص">
          <div className="stack">
            <div className="field"><label htmlFor="stall">تيار توقف المحرك الواحد (أمبير)</label><input id="stall" className="input mono" type="number" step="0.1" min="0.1" value={data.electrical.motorStallA} onChange={(e) => num('motorStallA', e.target.value)} style={{ maxWidth: 140 }} /></div>
            <div className="field"><label htmlFor="mv">جهد تغذية المحركات VM (فولت)</label><input id="mv" className="input mono" type="number" step="0.5" min="1" value={data.electrical.motorVoltage} onChange={(e) => num('motorVoltage', e.target.value)} style={{ maxWidth: 140 }} /></div>
            <div className="small muted">القيم افتراضية تقريبية؛ اضبطها حسب ورقة بيانات محركك. تُستخدم في فحوص التيار والجهد بصفحة التوصيلات.</div>
          </div>
        </Card>
        <Card title="التفضيلات">
          <div className="stack">
            <div className="row"><span>السمة:</span>
              <div className="seg" role="group" aria-label="السمة"><button aria-pressed={data.prefs.theme === 'dark'} onClick={() => app.set({ prefs: { ...data.prefs, theme: 'dark' } })}>داكنة</button><button aria-pressed={data.prefs.theme === 'light'} onClick={() => app.set({ prefs: { ...data.prefs, theme: 'light' } })}>فاتحة</button></div></div>
            <label className="check"><input type="checkbox" checked={data.prefs.sound} onChange={(e) => app.set({ prefs: { ...data.prefs, sound: e.target.checked } })} /><span>صوت تنبيهات الأدوية</span></label>
            <label className="check"><input type="checkbox" checked={data.prefs.speech} onChange={(e) => app.set({ prefs: { ...data.prefs, speech: e.target.checked } })} /><span>نطق التنبيهات</span></label>
          </div>
        </Card>
      </div>
      <Card title="تقدير التكلفة (يدوي)">
        <div className="small muted">تُدخل التقديرات من صفحة «مكتبة المكونات» لكل قطعة. المجموع الحالي: <b>{total.toLocaleString('ar-EG-u-nu-latn')}</b> لـ {entered} قطعة من {PARTS.length}. هذه تقديرات قابلة للتعديل وليست أسعارًا موثقة.</div>
        <div className="row" style={{ marginTop: 8 }}><button className="btn sm" disabled={!entered} onClick={() => app.set({ costs: {} })}>مسح التقديرات</button></div>
      </Card>
      <Card title="الربط مع عتاد حقيقي">
        <ul className="tight">
          <li>هذا المشروع <b>وضع محاكاة</b> بالكامل: لا يتصل بـ ESP32 أو أي جهاز، ولا يرسل بيانات لأي خادم.</li>
          <li>لربط عتاد لاحقًا يمكن استبدال مولّد البيانات التركيبية ومدير الأحداث بقناة حقيقية (Web Serial / MQTT / WebSocket) مع بقاء الواجهة كما هي.</li>
          <li>أي اتصال حقيقي يحتاج مصادقة وتشفيرًا وتقييمًا للمخاطر قبل الاعتماد عليه في رعاية فعلية.</li>
        </ul>
      </Card>
      <Card title="منطقة الخطر">
        <div className="row"><button className="btn danger" onClick={() => setConfirm(true)}>إعادة ضبط المشروع بالكامل</button><span className="small muted">يحذف التقدم والاعتمادات والتذكيرات والسجل من هذا المتصفح.</span></div>
      </Card>
      {confirm ? <ConfirmModal title="إعادة ضبط المشروع بالكامل؟" text="سيُفقد تقدم مراحل التركيب والتوصيلات المعتمدة والتذكيرات وسجل الأحداث." confirmLabel="إعادة الضبط" onConfirm={() => { sim.stop(); app.resetAll(); location.reload(); }} onClose={() => setConfirm(false)} /> : null}
    </div>
  );
}

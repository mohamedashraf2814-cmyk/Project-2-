import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Info, Pause, Play, RotateCcw, Square, X } from 'lucide-react';
import { WIRES, KIND_COLORS, KIND_LABELS } from '../data/wires';
import { INSTANCES, instanceById } from '../data/instances';
import { partById } from '../data/parts';
import { modelOf } from '../scenes/models';
import { Viewport } from '../engine/Viewport';
import { buildWireScene } from '../scenes/build';
import { AnimationController } from '../simulation/controller';
import { attemptVerify, partNameOf, resolveEndpoint, wireSafety, wireSignature } from '../wiring/resolve';
import { runChecks } from '../wiring/checks';
import { Badge, Card, ConfirmModal, ProgressBar, Seg } from '../components/ui';
import { useToast } from '../components/toast';
import { app } from '../store/app';
import { useApp } from '../store/hooks';
import { eventLog } from '../eventLog/eventLog';
import type { WireDef } from '../types';

type Group = 'robot' | 'wearable';

export default function WiringPage() {
  const data = useApp();
  const toast = useToast();
  const [group, setGroup] = useState<Group>('robot');
  const wires = useMemo(() => WIRES.filter((w) => w.group === group), [group]);
  const [selId, setSelId] = useState<string>(WIRES[0].id);
  const [showAll, setShowAll] = useState(false);
  const [destPart, setDestPart] = useState('');
  const [destPin, setDestPin] = useState('');
  const [seen, setSeen] = useState<Record<string, boolean>>({});
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [hint, setHint] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const ctrlRef = useRef<AnimationController | null>(null);
  if (!ctrlRef.current) ctrlRef.current = new AnimationController(3200, undefined, () => undefined);
  const ctrl = ctrlRef.current;
  useEffect(() => () => ctrl.dispose(), [ctrl]);
  const anim = useSyncExternalStore(ctrl.subscribe, ctrl.getSnapshot, ctrl.getSnapshot);

  const sel: WireDef = wires.find((w) => w.id === selId) ?? wires[0];
  const safety = wireSafety(sel, data.pinmap);
  const verified = useMemo(() => {
    const s = new Set<string>();
    for (const w of WIRES) if (data.verified[w.id] === wireSignature(w, data.pinmap)) s.add(w.id);
    return s;
  }, [data.verified, data.pinmap]);

  // selecting another wire restarts its animation (unsafe wires are never animated as correct)
  useEffect(() => {
    ctrl.stop();
    setFeedback(null);
    setHint(false);
    setDestPart('');
    setDestPin('');
    if (wireSafety(sel, data.pinmap).safe) ctrl.play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel.id, group]);
  useEffect(() => {
    if (anim.state === 'done') setSeen((s) => (s[sel.id] ? s : { ...s, [sel.id]: true }));
  }, [anim.state, sel.id]);
  useEffect(() => {
    if (!wires.some((w) => w.id === selId)) setSelId(wires[0].id);
  }, [wires, selId]);

  const src = resolveEndpoint(sel.from, data.pinmap);
  const dst = resolveEndpoint(sel.to, data.pinmap);
  const isVerified = verified.has(sel.id);
  const chosen = destPart && destPin ? { part: destPart, pin: destPin } : null;

  const scene = useMemo(
    () => buildWireScene({ group, map: data.pinmap, selectedId: sel.id, progress: anim.progress, verified, chosen, showAll }),
    [group, data.pinmap, sel.id, anim.progress, verified, chosen, showAll],
  );

  const groupParts = INSTANCES.filter((i) => i.group === group && modelOf(partById(i.part)!.model).pins.length > 0);
  const pinsOf = (partId: string) => {
    const inst = instanceById(partId);
    return inst ? modelOf(partById(inst.part)!.model).pins : [];
  };

  const onPinPick = (id: string) => {
    const [part, ...rest] = id.split('.');
    const pin = rest.join('.');
    if (!pin || !instanceById(part)) return;
    setDestPart(part);
    setDestPin(pin);
  };

  const verify = () => {
    if (!chosen) {
      setFeedback({ ok: false, msg: 'اختر المكوّن والدبوس الذي ينتهي عنده السلك (أو اضغط الدبوس في المشهد).' });
      return;
    }
    const r = attemptVerify(sel, data.pinmap, chosen);
    if (r.ok) {
      app.setVerified(sel.id, wireSignature(sel, data.pinmap));
      setFeedback({ ok: true, msg: 'تم اعتماد التوصيل.' });
      eventLog.add({ type: 'wiring', title: `اعتُمد التوصيل ${sel.id}`, detail: `${partNameOf(src.part)} ${src.label} → ${partNameOf(dst.part)} ${dst.label}` });
      toast.ok(`اعتُمد التوصيل ${sel.id}`);
    } else setFeedback({ ok: false, msg: r.message });
  };

  const idx = wires.findIndex((w) => w.id === sel.id);
  const go = (d: number) => setSelId(wires[Math.max(0, Math.min(wires.length - 1, idx + d))].id);
  const checks = useMemo(() => runChecks(data.pinmap, data.electrical), [data.pinmap, data.electrical]);
  const groupVerified = wires.filter((w) => verified.has(w.id)).length;
  const canVerify = safety.safe && (seen[sel.id] || anim.state === 'done');

  return (
    <div className="stack">
      <Card pad={false}>
        <div className="card-b row" style={{ justifyContent: 'space-between' }}>
          <Seg<Group> label="المجموعة" value={group} onChange={setGroup} options={[{ value: 'robot', label: 'الروبوت' }, { value: 'wearable', label: 'السوار' }]} />
          <div className="row" style={{ flex: 1, minWidth: 220 }}>
            <span className="small muted">المعتمد: {groupVerified} / {wires.length}</span>
            <div style={{ flex: 1, minWidth: 120 }}><ProgressBar value={(groupVerified / wires.length) * 100} ok={groupVerified === wires.length} /></div>
          </div>
          <button className="btn sm danger" onClick={() => setConfirmClear(true)}>مسح الاعتمادات</button>
        </div>
        {checks.some((c) => c.status === 'fail') ? <div className="card-b"><div className="note bad" role="alert"><AlertTriangle size={16} style={{ verticalAlign: 'middle' }} /> فحوص السلامة الكهربائية فيها مخالفات؛ التوصيلات المتأثرة لا تُعرض كأنها صحيحة ولا يمكن اعتمادها.</div></div> : null}
      </Card>

      <div className="wlab">
        <div className="stack">
          <div style={{ height: 'clamp(340px, 54vh, 560px)' }}>
            <Viewport scene={scene} view={{ yaw: 0.25, pitch: 0.95, dist: group === 'robot' ? 98 : 62, target: [0, 0, group === 'robot' ? 0 : 0] }} viewKey={group} onPinPick={onPinPick} label="مختبر التوصيلات" height="100%" />
          </div>
          <Card pad={false}>
            <div className="playbar" role="group" aria-label="التحكم في أنيميشن السلك">
              <button className="btn icon" aria-label="التوصيل السابق" disabled={idx <= 0} onClick={() => go(-1)}><ChevronRight size={18} /></button>
              {anim.state === 'idle' || anim.state === 'done' ? (
                <button className="btn primary" disabled={!safety.safe} onClick={() => ctrl.play()}><Play size={16} /> {anim.state === 'done' ? 'إعادة التشغيل' : 'تشغيل'}</button>
              ) : anim.state === 'playing' ? (
                <button className="btn" onClick={() => ctrl.pause()}><Pause size={16} /> إيقاف مؤقت</button>
              ) : (
                <button className="btn primary" onClick={() => ctrl.resume()}><Play size={16} /> استكمال</button>
              )}
              <button className="btn" disabled={!safety.safe} onClick={() => ctrl.replay()}><RotateCcw size={16} /> إعادة الأنيميشن</button>
              <button className="btn" onClick={() => { ctrl.stop(); setSelId(wires[0].id); }} data-tip="يعيد التسلسل لأول توصيل"><Square size={16} /> إعادة ضبط التسلسل</button>
              <div style={{ flex: 1, minWidth: 100 }}><ProgressBar value={anim.progress * 100} /></div>
              <button className="btn icon" aria-label="التوصيل التالي" disabled={idx >= wires.length - 1} onClick={() => go(1)}><ChevronLeft size={18} /></button>
            </div>
            <div className="card-b row" style={{ borderTop: '1px solid var(--line)' }}>
              <button className="btn sm" aria-pressed={showAll} onClick={() => setShowAll((v) => !v)}>{showAll ? 'إخفاء باقي الأسلاك' : 'إظهار كل الأسلاك'}</button>
              <div className="legend" aria-label="دليل الألوان">
                {(Object.keys(KIND_COLORS) as (keyof typeof KIND_COLORS)[]).map((k) => (
                  <span key={k}><i style={{ borderColor: KIND_COLORS[k] }} />{KIND_LABELS[k]}</span>
                ))}
              </div>
              <span className="muted small">الألوان للمساعدة فقط؛ اسم النوع مكتوب دائمًا.</span>
            </div>
          </Card>
        </div>

        <div className="stack">
          <Card title={`التوصيل ${sel.id}`} actions={isVerified ? <Badge tone="ok"><Check size={13} /> معتمد</Badge> : <Badge>غير معتمد</Badge>}>
            <div className="stack">
              <div><b>الغرض:</b> {sel.purpose}</div>
              <div className="grid2" style={{ gap: 8 }}>
                <div className="metric"><b className="mono" style={{ fontSize: 15 }}>{src.label}</b><span>{partNameOf(src.part)} — المصدر</span></div>
                <div className="metric"><b className="mono" style={{ fontSize: 15 }}>{dst.label}</b><span>{partNameOf(dst.part)} — الوجهة</span></div>
              </div>
              <div className="row"><Badge tone="info">{KIND_LABELS[sel.kind]}</Badge></div>
              <div className="note"><b>التعليمات:</b> {sel.instruction}</div>
              {!safety.safe ? (
                <div className="note bad" role="alert"><b>توصيل غير آمن — لن يُعرض كصحيح</b><ul className="tight" style={{ marginTop: 4 }}>{safety.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
                  <div className="small" style={{ marginTop: 6 }}>عدّل خريطة الدبابيس من «إعدادات المشروع».</div></div>
              ) : null}
              <fieldset style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 12 }} disabled={!safety.safe}>
                <legend className="small muted" style={{ padding: '0 6px' }}>اعتماد التوصيل: أين ينتهي هذا السلك؟</legend>
                <div className="grid2" style={{ gap: 8 }}>
                  <div className="field">
                    <label htmlFor="dp">المكوّن</label>
                    <select id="dp" className="input" value={destPart} onChange={(e) => { setDestPart(e.target.value); setDestPin(''); setFeedback(null); }}>
                      <option value="">— اختر —</option>
                      {groupParts.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="dpin">الدبوس</label>
                    <select id="dpin" className="input mono" value={destPin} onChange={(e) => { setDestPin(e.target.value); setFeedback(null); }} disabled={!destPart}>
                      <option value="">— اختر —</option>
                      {pinsOf(destPart).map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="row" style={{ marginTop: 10 }}>
                  <button className="btn primary" disabled={!canVerify} onClick={verify}>تحقق واعتمد</button>
                  <button className="btn sm" onClick={() => setHint((h) => !h)}><Info size={14} /> تلميح</button>
                  {isVerified ? <button className="btn sm" onClick={() => { app.setVerified(sel.id, null); setFeedback(null); }}>إلغاء الاعتماد</button> : null}
                </div>
                {!canVerify && safety.safe ? <div className="small muted" style={{ marginTop: 6 }}>شاهد أنيميشن السلك حتى نهايته أولًا ليُفعَّل زر الاعتماد.</div> : null}
                {hint ? <div className="small" style={{ marginTop: 6 }}>الوجهة هي <b>{partNameOf(dst.part)}</b> عند الدبوس <span className="mono">{dst.label}</span>.</div> : null}
                {feedback ? <div className={`note ${feedback.ok ? 'ok' : 'bad'}`} role="status" style={{ marginTop: 8 }}>{feedback.ok ? <Check size={14} style={{ verticalAlign: 'middle' }} /> : <X size={14} style={{ verticalAlign: 'middle' }} />} {feedback.msg}</div> : null}
              </fieldset>
            </div>
          </Card>

          <Card title="فحوص السلامة الكهربائية" pad={false}>
            <div className="card-b">
              {checks.map((c) => (
                <div key={c.id} className="check-row">
                  <span aria-hidden="true" className={`status-dot ${c.status === 'ok' ? 'ok' : c.status === 'fail' ? 'bad' : ''}`} style={{ marginTop: 8, background: c.status === 'warn' ? 'var(--warn)' : c.status === 'info' ? 'var(--cyan)' : undefined }} />
                  <div>
                    <b>{c.title}</b> <Badge tone={c.status === 'ok' ? 'ok' : c.status === 'fail' ? 'bad' : c.status === 'warn' ? 'warn' : 'info'}>{c.status === 'ok' ? 'سليم' : c.status === 'fail' ? 'مخالفة' : c.status === 'warn' ? 'تنبيه' : 'ملاحظة'}</Badge>
                    <div className="muted small">{c.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <Card title="جدول التوصيلات" pad={false}>
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr><th>#</th><th>المكوّن A</th><th>الدبوس (المصدر)</th><th>المكوّن B</th><th>الدبوس (الوجهة)</th><th>النوع</th><th>الغرض</th><th>الحالة</th></tr>
            </thead>
            <tbody>
              {wires.map((w) => {
                const a = resolveEndpoint(w.from, data.pinmap);
                const b = resolveEndpoint(w.to, data.pinmap);
                const safe = wireSafety(w, data.pinmap).safe;
                const v = verified.has(w.id);
                return (
                  <tr key={w.id} className={`click ${w.id === sel.id ? 'sel' : ''}`} onClick={() => setSelId(w.id)} tabIndex={0} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setSelId(w.id))} aria-selected={w.id === sel.id}>
                    <td className="mono">{w.id}</td>
                    <td>{partNameOf(a.part)}</td>
                    <td className="mono">{a.label}</td>
                    <td>{partNameOf(b.part)}</td>
                    <td className="mono">{b.label}</td>
                    <td><span style={{ borderInlineStart: `4px solid ${KIND_COLORS[w.kind]}`, paddingInlineStart: 6 }}>{KIND_LABELS[w.kind]}</span></td>
                    <td>{w.purpose}</td>
                    <td>{!safe ? <Badge tone="bad">غير آمن</Badge> : v ? <Badge tone="ok"><Check size={12} /> معتمد</Badge> : <Badge>غير معتمد</Badge>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      {confirmClear ? <ConfirmModal title="مسح كل الاعتمادات؟" text="ستحتاج لإعادة اعتماد التوصيلات، وستُقفل المرحلة 10 حتى تكتمل." confirmLabel="مسح" onConfirm={() => { app.clearVerified(); toast.info('تم مسح الاعتمادات.'); }} onClose={() => setConfirmClear(false)} /> : null}
    </div>
  );
}

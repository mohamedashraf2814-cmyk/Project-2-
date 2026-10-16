import { useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import { Check, ChevronLeft, ChevronRight, Pause, Play, RotateCcw, Square, Search, Eye } from 'lucide-react';
import { STEPS } from '../data/steps';
import { INSTANCES } from '../data/instances';
import { PARTS, CATEGORY_LABELS } from '../data/parts';
import { WIRES, KIND_LABELS } from '../data/wires';
import { Viewport, type ViewSpec } from '../engine/Viewport';
import { buildLabScene } from '../scenes/build';
import { AnimationController } from '../simulation/controller';
import { completionBlock, initialWizard, progressPct, reduce, type GateContext } from '../assembly/wizard';
import { PartInspector } from '../components/PartInspector';
import { Badge, Card, ProgressBar, Seg } from '../components/ui';
import { useToast } from '../components/toast';
import { app } from '../store/app';
import { useApp, useEvents, useSlow } from '../store/hooks';
import { resolveEndpoint, wireSafety, wireSignature, partNameOf } from '../wiring/resolve';
import { eventLog } from '../eventLog/eventLog';

type Preset = 'all' | 'close' | 'top';
const DURATION = 7000;

function viewFor(kind: 'robot' | 'wearable' | 'both', preset: Preset): ViewSpec {
  if (kind === 'wearable') return preset === 'top' ? { yaw: 0.2, pitch: 1.35, dist: 34, target: [0, 0, -6] } : { yaw: 0.6, pitch: 0.65, dist: 36, target: [0, 0, -8] };
  if (kind === 'both') return { yaw: 0.55, pitch: 0.7, dist: 112, target: [22, 2, -12] };
  if (preset === 'close') return { yaw: 0.65, pitch: 0.7, dist: 46, target: [0, 4, 0] };
  if (preset === 'top') return { yaw: 0.0, pitch: 1.35, dist: 70, target: [0, 0, -14] };
  return { yaw: 0.6, pitch: 0.62, dist: 100, target: [0, 3, -16] };
}

export default function LabPage({ go }: { go: (p: string) => void }) {
  const data = useApp();
  const events = useEvents();
  const slow = useSlow();
  const toast = useToast();
  const [state, dispatch] = useReducer(reduce, { ...initialWizard, step: data.wizard.step, completed: data.wizard.completed });
  const [selected, setSelected] = useState<string | null>(null);
  const [partId, setPartId] = useState<string | null>(null);
  const [tab, setTab] = useState<'step' | 'part' | 'wires'>('step');
  const [preset, setPreset] = useState<Preset>('all');
  const [focus, setFocus] = useState(true);
  const [q, setQ] = useState('');

  // animation controller lives for the lifetime of the page and is always disposed
  const ctrlRef = useRef<AnimationController | null>(null);
  if (!ctrlRef.current) ctrlRef.current = new AnimationController(DURATION, undefined, () => dispatch({ type: 'finished' }));
  const ctrl = ctrlRef.current;
  useEffect(() => () => ctrl.dispose(), [ctrl]);
  const anim = useSyncExternalStore(ctrl.subscribe, ctrl.getSnapshot, ctrl.getSnapshot);

  // persist wizard progress
  useEffect(() => {
    app.setWizard({ step: state.step, completed: state.completed });
  }, [state.step, state.completed]);

  // entering a stage restarts its animation, unless it was already completed (show final state)
  useEffect(() => {
    ctrl.stop();
    if (state.completed.includes(state.step)) ctrl.finish();
    else {
      ctrl.play();
      dispatch({ type: 'play' });
    }
    setPreset(state.step >= 5 && state.step <= 8 ? 'close' : 'all');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.step]);

  const step = STEPS[state.step - 1];
  const verifiedSet = useMemo(() => {
    const s = new Set<string>();
    for (const w of WIRES) if (data.verified[w.id] === wireSignature(w, data.pinmap)) s.add(w.id);
    return s;
  }, [data.verified, data.pinmap]);

  const ctx: GateContext = useMemo(
    () => ({
      allWiresVerified: WIRES.every((w) => verifiedSet.has(w.id)),
      simRanOnce: slow.ranOnce || events.some((e) => e.type === 'sim_start'),
      testsDone: {
        obstacle: events.some((e) => e.type === 'obstacle_stop' || e.type === 'obstacle_avoid'),
        medication: events.some((e) => e.type === 'med_reminder'),
        fall: events.some((e) => e.type === 'fall_suspected'),
        emergency: events.some((e) => e.type === 'emergency'),
      },
    }),
    [verifiedSet, slow.ranOnce, events],
  );
  const block = completionBlock(state.step, ctx, state.completed);
  const done = state.completed.includes(state.step);

  const scene = useMemo(() => buildLabScene({ step: state.step, t: anim.progress, selected, map: data.pinmap, focus }), [state.step, anim.progress, selected, data.pinmap, focus]);
  const view = viewFor(step.view, preset);

  const selectPart = (id: string) => {
    setPartId(id);
    setTab('part');
    const inst = INSTANCES.find((i) => i.part === id);
    setSelected(inst ? inst.id : null);
  };
  const onPick = (owner: string | null) => {
    if (!owner) return;
    const inst = INSTANCES.find((i) => i.id === owner);
    if (inst) {
      setSelected(inst.id);
      setPartId(inst.part);
      setTab('part');
    }
  };

  const toggleDone = (on: boolean) => {
    if (on) {
      if (block) {
        toast.bad(block);
        return;
      }
      dispatch({ type: 'complete', step: state.step });
      eventLog.add({ type: 'assembly', title: `اكتملت المرحلة ${state.step}: ${step.title}`, detail: 'علّمها المستخدم يدويًا.' });
      toast.ok(`اكتملت المرحلة ${state.step}.`);
    } else dispatch({ type: 'uncomplete', step: state.step });
  };

  const list = PARTS.filter((p) => !q || p.nameAr.includes(q) || p.nameEn.toLowerCase().includes(q.toLowerCase()));
  const stepWires = WIRES.filter((w) => w.stage === state.step);
  const playing = anim.state === 'playing';

  return (
    <div className="stack">
      <Card pad={false}>
        <div className="card-b stack" style={{ gap: 10 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <b>المرحلة {state.step} من {STEPS.length}:</b> {step.title}
            </div>
            <div className="row">
              <Badge tone={done ? 'ok' : 'neutral'}>{done ? 'مكتملة' : 'غير مكتملة'}</Badge>
              <span className="muted small">اكتمل {state.completed.length} / {STEPS.length}</span>
            </div>
          </div>
          <ProgressBar value={progressPct(state)} ok={state.completed.length === STEPS.length} />
          <div className="stagebar" role="list" aria-label="مراحل التركيب">
            {STEPS.map((s) => (
              <button key={s.n} role="listitem" className={`stagebtn ${state.completed.includes(s.n) ? 'done' : ''}`} aria-current={s.n === state.step ? 'step' : undefined} onClick={() => dispatch({ type: 'goto', step: s.n })}>
                <b>{state.completed.includes(s.n) ? <Check size={13} /> : s.n}</b>
                {s.title}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <div className="lab">
        <Card title="مكتبة المكونات" className="lab-lib" pad={false}>
          <div className="card-b stack" style={{ gap: 8 }}>
            <div style={{ position: 'relative' }}>
              <label className="sr" htmlFor="lib-q">بحث في المكونات</label>
              <input id="lib-q" className="input" type="search" placeholder="ابحث بالاسم…" value={q} onChange={(e) => setQ(e.target.value)} style={{ paddingInlineStart: 34 }} />
              <Search size={16} style={{ position: 'absolute', insetInlineStart: 10, top: 11, color: 'var(--muted)' }} />
            </div>
            <div style={{ maxHeight: 420, overflow: 'auto' }}>
              {list.length === 0 ? <div className="empty">لا توجد نتائج.</div> : null}
              {list.map((p) => (
                <button key={p.id} className="libitem" aria-pressed={partId === p.id} onClick={() => selectPart(p.id)}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    {p.nameAr}
                    <small>{CATEGORY_LABELS[p.category]}</small>
                  </span>
                  {step.highlight.some((h) => INSTANCES.find((i) => i.id === h)?.part === p.id) ? <Badge tone="info">هذه المرحلة</Badge> : null}
                </button>
              ))}
            </div>
          </div>
        </Card>

        <div className="lab-center">
          <div className="bench">
            <Viewport scene={scene} view={view} viewKey={`${step.view}:${preset}`} onPick={onPick} label="ورشة التركيب ثلاثية الأبعاد" height="100%" />
          </div>
          <Card pad={false}>
            <div className="playbar" role="group" aria-label="التحكم في الأنيميشن">
              <button className="btn icon" aria-label="المرحلة السابقة" data-tip="المرحلة السابقة" disabled={state.step === 1} onClick={() => dispatch({ type: 'prev' })}><ChevronRight size={18} /></button>
              {anim.state === 'idle' || anim.state === 'done' ? (
                <button className="btn primary" onClick={() => { ctrl.play(); dispatch({ type: anim.state === 'done' ? 'replay' : 'play' }); }}><Play size={16} /> {anim.state === 'done' ? 'إعادة الأنيميشن' : 'تشغيل'}</button>
              ) : playing ? (
                <button className="btn" onClick={() => { ctrl.pause(); dispatch({ type: 'pause' }); }}><Pause size={16} /> إيقاف مؤقت</button>
              ) : (
                <button className="btn primary" onClick={() => { ctrl.resume(); dispatch({ type: 'resume' }); }}><Play size={16} /> استكمال</button>
              )}
              <button className="btn" onClick={() => { ctrl.replay(); dispatch({ type: 'replay' }); }}><RotateCcw size={16} /> إعادة</button>
              <button className="btn" disabled={anim.state === 'idle'} onClick={() => { ctrl.stop(); dispatch({ type: 'stop' }); }}><Square size={16} /> إيقاف</button>
              <div style={{ flex: 1, minWidth: 120 }}><ProgressBar value={anim.progress * 100} /></div>
              <label className="row small" style={{ gap: 6 }}>
                السرعة
                <select className="input" style={{ width: 78, minHeight: 32 }} defaultValue="1" onChange={(e) => ctrl.setSpeed(Number(e.target.value))} aria-label="سرعة الأنيميشن">
                  <option value="0.5">0.5×</option>
                  <option value="1">1×</option>
                  <option value="2">2×</option>
                </select>
              </label>
              <button className="btn icon" aria-label="المرحلة التالية" data-tip="المرحلة التالية" disabled={state.step === STEPS.length} onClick={() => dispatch({ type: 'next' })}><ChevronLeft size={18} /></button>
            </div>
            <div className="card-b row" style={{ borderTop: '1px solid var(--line)' }}>
              <Seg<Preset> label="زاوية العرض" value={preset} onChange={setPreset} options={[{ value: 'all', label: 'الورشة كاملة' }, { value: 'close', label: 'قريب' }, { value: 'top', label: 'من الأعلى' }]} />
              <button className="btn sm" aria-pressed={focus} onClick={() => setFocus((f) => !f)}><Eye size={15} /> {focus ? 'تعتيم غير المحدد: مفعّل' : 'تعتيم غير المحدد: متوقف'}</button>
              <span className="muted small">اسحب للتدوير · عجلة الفأرة للتكبير · Shift+سحب للتحريك · اضغط أي قطعة</span>
            </div>
          </Card>
        </div>

        <div className="lab-side card" role="region" aria-label="تفاصيل المرحلة">
          <div className="card-h">
            <Seg<'step' | 'part' | 'wires'> label="تبويب التفاصيل" value={tab} onChange={setTab} options={[{ value: 'step', label: 'الخطوة' }, { value: 'part', label: 'القطعة' }, { value: 'wires', label: 'التوصيلات' }]} />
          </div>
          <div className="card-b stack">
            {tab === 'step' ? (
              <>
                <h3 style={{ fontSize: 17 }}>{state.step}. {step.title}</h3>
                <div className="note"><b>لماذا هذه الخطوة؟</b><div>{step.why}</div></div>
                <div className="steps">
                  <ol>
                    {step.instructions.map((t, i) => <li key={i}><b>{i + 1}.</b> {t}</li>)}
                  </ol>
                </div>
                {step.safety.length ? (
                  <div className="note warn"><b>السلامة</b><ul className="tight warnlist" style={{ marginTop: 4 }}>{step.safety.map((s) => <li key={s}>{s}</li>)}</ul></div>
                ) : null}
                <details className="acc">
                  <summary>استكشاف الأخطاء وإصلاحها</summary>
                  <div className="stack" style={{ gap: 8 }}>
                    {step.troubleshooting.map((t) => <div key={t.problem}><b>{t.problem}</b><div className="muted">{t.fix}</div></div>)}
                  </div>
                </details>
                {block && !done ? <div className="note" role="status">{block}</div> : null}
                <label className="check">
                  <input type="checkbox" checked={done} onChange={(e) => toggleDone(e.target.checked)} aria-describedby="why-gate" />
                  <span>أتممت هذه المرحلة بنفسي</span>
                </label>
                <span id="why-gate" className="muted small">لا تُعلَّم المرحلة مكتملة تلقائيًا عند انتهاء الأنيميشن؛ أنت من يؤكد.</span>
                {state.step === 10 ? <button className="btn primary" onClick={() => go('wiring')}>فتح توصيلات الدائرة</button> : null}
                {state.step === 11 ? <button className="btn primary" onClick={() => go('robot')}>فتح محاكاة الروبوت</button> : null}
                {state.step === 12 ? <button className="btn primary" onClick={() => go('caretwin')}>فتح Care Twin</button> : null}
              </>
            ) : null}
            {tab === 'part' ? (partId ? <PartInspector partId={partId} /> : <div className="empty">اضغط على قطعة في المشهد أو اخترها من المكتبة لعرض مواصفاتها.</div>) : null}
            {tab === 'wires' ? (
              stepWires.length === 0 ? (
                <div className="empty">لا توجد توصيلات جديدة في هذه المرحلة. افتح «توصيلات الدائرة» للجدول الكامل.</div>
              ) : (
                <div className="table-wrap">
                  <table className="t">
                    <thead><tr><th>من</th><th>إلى</th><th>النوع</th></tr></thead>
                    <tbody>
                      {stepWires.map((w) => {
                        const a = resolveEndpoint(w.from, data.pinmap);
                        const b = resolveEndpoint(w.to, data.pinmap);
                        const safe = wireSafety(w, data.pinmap).safe;
                        return (
                          <tr key={w.id}>
                            <td>{partNameOf(a.part)} <span className="mono">{a.label}</span></td>
                            <td>{partNameOf(b.part)} <span className="mono">{b.label}</span></td>
                            <td>{safe ? KIND_LABELS[w.kind] : <Badge tone="bad">غير آمن</Badge>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

import { useMemo } from 'react';
import { PARTS, CATEGORY_LABELS } from '../data/parts';
import { Viewport } from '../engine/Viewport';
import { buildPartScene } from '../scenes/robot3d';
import { modelOf } from '../scenes/models';
import type { PartInfo } from '../types';
import { app } from '../store/app';
import { useApp } from '../store/hooks';
import { Badge } from './ui';
import { KIND_LABELS } from '../data/wires';

export function PartPreview({ part, height = 170 }: { part: PartInfo; height?: number }) {
  const model = modelOf(part.model);
  const scene = useMemo(() => buildPartScene(part.model, Math.min(3.2, 7 / Math.max(model.size[0], model.size[2], 1))), [part.model, model]);
  const dist = 14;
  return <Viewport scene={scene} view={{ yaw: 0.7, pitch: 0.5, dist, target: [0, Math.max(0.4, model.size[1] / 2) * 1.5, 0] }} viewKey={part.id} autoRotate compact height={height} label={`نموذج ثلاثي الأبعاد: ${part.nameAr}`} />;
}

/** Inspection panel for a part: purpose, specs, power, pins, connection notes, estimate, safety. */
export function PartInspector({ partId, onClose }: { partId: string; onClose?: () => void }) {
  const data = useApp();
  const part = PARTS.find((p) => p.id === partId);
  if (!part) return <div className="empty">اختر قطعة من القائمة أو من المشهد لعرض تفاصيلها.</div>;
  const model = modelOf(part.model);
  const cost = data.costs[part.id];
  return (
    <div className="stack" aria-live="polite">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h3 style={{ fontSize: 17 }}>{part.nameAr}</h3>
          <div className="mono muted small">{part.nameEn}</div>
        </div>
        <div className="row">
          <Badge tone="info">{CATEGORY_LABELS[part.category]}</Badge>
          {onClose ? <button className="btn sm" onClick={onClose}>إغلاق</button> : null}
        </div>
      </div>
      <PartPreview part={part} />
      <p style={{ margin: 0 }}>{part.purpose}</p>
      <details className="acc" open>
        <summary>المواصفات المهمة</summary>
        <div><ul className="tight">{part.specs.map((s) => <li key={s}>{s}</li>)}</ul></div>
      </details>
      <details className="acc" open>
        <summary>الطاقة</summary>
        <div>{part.power}</div>
      </details>
      <details className="acc" open>
        <summary>الدبابيس ({model.pins.length})</summary>
        <div>
          <p className="muted small" style={{ marginTop: 0 }}>{part.pinsNote}</p>
          {model.pins.length ? (
            <div className="row" style={{ gap: 6 }}>
              {model.pins.map((p) => (
                <span key={p.id} className="badge mono" title={KIND_LABELS[p.role]}>{p.label}</span>
              ))}
            </div>
          ) : null}
        </div>
      </details>
      <details className="acc">
        <summary>تعليمات التوصيل</summary>
        <div><ul className="tight">{part.connect.map((s) => <li key={s}>{s}</li>)}</ul></div>
      </details>
      <div><b>موضع التركيب:</b> {part.position}</div>
      {part.safety.length ? (
        <div className="note warn">
          <b>تحذيرات السلامة</b>
          <ul className="tight warnlist" style={{ marginTop: 4 }}>{part.safety.map((s) => <li key={s}>{s}</li>)}</ul>
        </div>
      ) : null}
      <div className="field">
        <label htmlFor={`cost-${part.id}`}>التكلفة التقديرية (قيمة تدخلها أنت — ليست سعرًا موثّقًا)</label>
        <input
          id={`cost-${part.id}`}
          className="input mono"
          type="number"
          min={0}
          step="any"
          inputMode="decimal"
          placeholder="غير محددة"
          value={cost ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            const n = Number(v);
            const next = { ...data.costs };
            if (v === '' || !Number.isFinite(n) || n < 0) delete next[part.id];
            else next[part.id] = n;
            app.set({ costs: next });
          }}
        />
      </div>
    </div>
  );
}

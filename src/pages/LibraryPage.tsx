import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { CATEGORY_LABELS, PARTS } from '../data/parts';
import { PartInspector, PartPreview } from '../components/PartInspector';
import { Badge, Card, Seg } from '../components/ui';
import { useApp } from '../store/hooks';

type Cat = 'all' | 'robot' | 'wearable' | 'optional';

export default function LibraryPage() {
  const data = useApp();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<Cat>('all');
  const [sel, setSel] = useState<string>('esp32');
  const list = useMemo(
    () =>
      PARTS.filter((p) => (cat === 'all' || p.category === cat) && (!q || [p.nameAr, p.nameEn, ...(p.tags ?? [])].join(' ').toLowerCase().includes(q.toLowerCase()))),
    [q, cat],
  );
  const total = PARTS.reduce((s, p) => s + (data.costs[p.id] ?? 0), 0);
  const entered = PARTS.filter((p) => data.costs[p.id] != null).length;

  return (
    <div className="wlab">
      <div className="stack">
        <Card pad={false}>
          <div className="card-b row" style={{ justifyContent: 'space-between' }}>
            <div className="row">
              <div style={{ position: 'relative', minWidth: 240 }}>
                <label className="sr" htmlFor="q">بحث</label>
                <input id="q" className="input" type="search" placeholder="ابحث: ESP32، حساس، بطارية…" value={q} onChange={(e) => setQ(e.target.value)} style={{ paddingInlineStart: 34 }} />
                <Search size={16} style={{ position: 'absolute', insetInlineStart: 10, top: 11, color: 'var(--muted)' }} />
              </div>
              <Seg<Cat> label="التصنيف" value={cat} onChange={setCat} options={[{ value: 'all', label: 'الكل' }, { value: 'robot', label: 'الروبوت' }, { value: 'wearable', label: 'السوار' }, { value: 'optional', label: 'اختيارية' }]} />
            </div>
            <div className="small muted" role="status">
              {entered ? `مجموع التقديرات التي أدخلتها: ${total.toLocaleString('ar-EG-u-nu-latn')} (لـ ${entered} قطعة) — تقدير قابل للتعديل وليس سعرًا موثقًا` : 'لم تُدخل أي تقدير للتكلفة بعد.'}
            </div>
          </div>
        </Card>
        {list.length === 0 ? <Card><div className="empty">لا توجد قطع مطابقة. جرّب كلمة أخرى.</div></Card> : null}
        <div className="grid3">
          {list.map((p) => (
            <div key={p.id} className="card partcard" style={{ textAlign: 'start', borderColor: sel === p.id ? 'var(--cyan)' : undefined }}>
              <PartPreview part={p} height={140} />
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <button className="btn sm" style={{ fontWeight: 600 }} aria-pressed={sel === p.id} onClick={() => setSel(p.id)}>{p.nameAr}</button>
                <Badge tone={p.category === 'optional' ? 'neutral' : 'info'}>{CATEGORY_LABELS[p.category]}</Badge>
              </div>
              <div className="mono muted small">{p.nameEn}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="card lab-side">
        <div className="card-b"><PartInspector partId={sel} /></div>
      </div>
    </div>
  );
}

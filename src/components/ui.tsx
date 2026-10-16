import { Component, useEffect, useId, useRef, type ReactNode } from 'react';

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'ok' | 'info' | 'warn' | 'bad'; children: ReactNode }) {
  return <span className={`badge ${tone === 'neutral' ? '' : tone}`}>{children}</span>;
}

export function Card({ title, actions, children, pad = true, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; pad?: boolean; className?: string }) {
  return (
    <section className={`card ${className ?? ''}`}>
      {title || actions ? (
        <div className="card-h">
          {title ? <h2>{title}</h2> : <span />}
          {actions ? <div className="row">{actions}</div> : null}
        </div>
      ) : null}
      <div className={pad ? 'card-b' : ''}>{children}</div>
    </section>
  );
}

export function Seg<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Metric({ label, value, tone }: { label: string; value: ReactNode; tone?: 'bad' | 'ok' | 'warn' }) {
  return (
    <div className="metric">
      <b style={tone === 'bad' ? { color: 'var(--danger)' } : tone === 'ok' ? { color: 'var(--lime)' } : tone === 'warn' ? { color: 'var(--warn)' } : undefined}>{value}</b>
      <span>{label}</span>
    </div>
  );
}

export function ProgressBar({ value, ok }: { value: number; ok?: boolean }) {
  return (
    <div className={`bar ${ok ? 'ok' : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)}>
      <i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function ConfirmModal({ title, text, confirmLabel, onConfirm, onClose, danger = true }: { title: string; text: string; confirmLabel: string; onConfirm: () => void; onClose: () => void; danger?: boolean }) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('button[data-first]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && ref.current) {
        const f = Array.from(ref.current.querySelectorAll<HTMLElement>('button'));
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby={id} ref={ref}>
        <h2 id={id}>{title}</h2>
        <p className="muted" style={{ margin: 0 }}>{text}</p>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn" data-first onClick={onClose}>إلغاء</button>
          <button className={`btn ${danger ? 'danger' : 'primary'}`} onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

export class ErrorBoundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) {
    return { err };
  }
  render() {
    if (this.state.err)
      return (
        <div style={{ padding: 24 }}>
          <div className="note bad" role="alert">
            حدث خطأ غير متوقع في الواجهة: {this.state.err.message}. أعد تحميل الصفحة؛ تقدّمك محفوظ في المتصفح.
            <div style={{ marginTop: 10 }}><button className="btn" onClick={() => location.reload()}>إعادة التحميل</button></div>
          </div>
        </div>
      );
    return this.props.children;
  }
}

export const mono = (s: string | number) => <span className="mono">{s}</span>;

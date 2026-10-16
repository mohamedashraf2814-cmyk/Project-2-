import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

interface T { id: number; kind: 'ok' | 'bad' | 'info'; text: string }
interface Api { ok: (m: string) => void; bad: (m: string) => void; info: (m: string) => void }
const Ctx = createContext<Api | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<T[]>([]);
  const seq = useRef(0);
  const push = useCallback((kind: T['kind'], text: string) => {
    seq.current += 1;
    const id = seq.current;
    setList((l) => [...l.slice(-3), { id, kind, text }]);
    window.setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), kind === 'bad' ? 6000 : 3500);
  }, []);
  const api = useMemo<Api>(() => ({ ok: (m) => push('ok', m), bad: (m) => push('bad', m), info: (m) => push('info', m) }), [push]);
  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {list.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): Api {
  const v = useContext(Ctx);
  if (!v) throw new Error('useToast outside ToastProvider');
  return v;
}

import { STEP_COUNT } from '../data/steps';

export type Phase = 'ready' | 'playing' | 'paused' | 'finished';

export interface WizardState {
  step: number; // 1..STEP_COUNT
  completed: number[];
  phase: Phase;
}

export type WizardAction =
  | { type: 'goto'; step: number }
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'stop' }
  | { type: 'finished' }
  | { type: 'replay' }
  | { type: 'complete'; step: number }
  | { type: 'uncomplete'; step: number }
  | { type: 'reset' };

export const initialWizard: WizardState = { step: 1, completed: [], phase: 'ready' };

export function reduce(s: WizardState, a: WizardAction): WizardState {
  switch (a.type) {
    case 'goto':
      return a.step >= 1 && a.step <= STEP_COUNT ? { ...s, step: a.step, phase: 'ready' } : s;
    case 'next':
      return s.step < STEP_COUNT ? { ...s, step: s.step + 1, phase: 'ready' } : s;
    case 'prev':
      return s.step > 1 ? { ...s, step: s.step - 1, phase: 'ready' } : s;
    case 'play':
      return s.phase === 'ready' || s.phase === 'finished' ? { ...s, phase: 'playing' } : s;
    case 'pause':
      return s.phase === 'playing' ? { ...s, phase: 'paused' } : s;
    case 'resume':
      return s.phase === 'paused' ? { ...s, phase: 'playing' } : s;
    case 'stop':
      return { ...s, phase: 'ready' };
    case 'finished':
      return s.phase === 'playing' ? { ...s, phase: 'finished' } : s;
    case 'replay':
      return { ...s, phase: 'playing' };
    case 'complete':
      // completion is always an explicit user action; animation end never calls this
      return s.completed.includes(a.step) ? s : { ...s, completed: [...s.completed, a.step].sort((x, y) => x - y) };
    case 'uncomplete':
      return { ...s, completed: s.completed.filter((x) => x !== a.step) };
    case 'reset':
      return { ...initialWizard };
    default:
      return s;
  }
}

export interface GateContext {
  allWiresVerified: boolean;
  simRanOnce: boolean;
  testsDone: { obstacle: boolean; medication: boolean; fall: boolean; emergency: boolean };
}

/** Returns a reason the stage cannot be marked complete yet, or null. */
export function completionBlock(step: number, ctx: GateContext, completed: number[]): string | null {
  if (step === 10 && !ctx.allWiresVerified) return 'اعتمد كل التوصيلات أولًا من صفحة «توصيلات الدائرة».';
  if (step === 11) {
    if (!completed.includes(10)) return 'أكمل المرحلة 10 (التحقق من التوصيلات) أولًا.';
    if (!ctx.simRanOnce) return 'شغّل محاكاة الروبوت مرة واحدة على الأقل.';
  }
  if (step === 12) {
    const missing: string[] = [];
    if (!ctx.testsDone.obstacle) missing.push('إيقاف عند عائق');
    if (!ctx.testsDone.medication) missing.push('تذكير دواء');
    if (!ctx.testsDone.fall) missing.push('سقوط تجريبي');
    if (!ctx.testsDone.emergency) missing.push('طوارئ تجريبية');
    if (missing.length) return `اختبارات لم تُجرَ بعد: ${missing.join('، ')}.`;
  }
  return null;
}

export function progressPct(s: WizardState): number {
  return Math.round((s.completed.length / STEP_COUNT) * 100);
}

export function sanitize(raw: unknown): WizardState {
  const o = (raw ?? {}) as Partial<WizardState>;
  const step = typeof o.step === 'number' && o.step >= 1 && o.step <= STEP_COUNT ? Math.floor(o.step) : 1;
  const completed = Array.isArray(o.completed) ? [...new Set(o.completed.filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= STEP_COUNT))].sort((a, b) => a - b) : [];
  return { step, completed, phase: 'ready' };
}

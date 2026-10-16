import type { MedReminder, PinMap } from '../types';
import { DEFAULT_PINMAP } from '../data/gpio';
import { DEFAULT_ELECTRICAL, type ElectricalConfig } from '../wiring/checks';
import { initialWizard, sanitize, type WizardState } from '../assembly/wizard';
import { readJSON, removeKey, writeJSON } from '../utilities/storage';
import { uid } from '../utilities/rng';

export interface Prefs {
  theme: 'dark' | 'light';
  sound: boolean;
  speech: boolean;
}

export interface AppData {
  wizard: Pick<WizardState, 'step' | 'completed'>;
  /** wire id → signature at the time it was verified */
  verified: Record<string, string>;
  pinmap: PinMap;
  electrical: ElectricalConfig;
  /** user-entered cost estimates (null = not entered) */
  costs: Record<string, number | null>;
  reminders: MedReminder[];
  prefs: Prefs;
}

const DEFAULTS: AppData = {
  wizard: { step: initialWizard.step, completed: [] },
  verified: {},
  pinmap: DEFAULT_PINMAP,
  electrical: DEFAULT_ELECTRICAL,
  costs: {},
  reminders: [],
  prefs: { theme: 'dark', sound: true, speech: false },
};

type Listener = () => void;

function sanitizeData(raw: Partial<AppData>): AppData {
  const wiz = sanitize(raw.wizard);
  const pm = { ...DEFAULT_PINMAP };
  if (raw.pinmap && typeof raw.pinmap === 'object') {
    for (const k of Object.keys(DEFAULT_PINMAP) as (keyof PinMap)[]) {
      const v = (raw.pinmap as Record<string, unknown>)[k];
      if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 48) pm[k] = v;
    }
  }
  const el = { ...DEFAULT_ELECTRICAL };
  if (raw.electrical) {
    if (typeof raw.electrical.motorStallA === 'number' && raw.electrical.motorStallA > 0 && raw.electrical.motorStallA < 50) el.motorStallA = raw.electrical.motorStallA;
    if (typeof raw.electrical.motorVoltage === 'number' && raw.electrical.motorVoltage > 0 && raw.electrical.motorVoltage < 60) el.motorVoltage = raw.electrical.motorVoltage;
  }
  const costs: Record<string, number | null> = {};
  if (raw.costs && typeof raw.costs === 'object') {
    for (const [k, v] of Object.entries(raw.costs)) if (typeof v === 'number' && Number.isFinite(v) && v >= 0) costs[k] = v;
  }
  const reminders = Array.isArray(raw.reminders)
    ? raw.reminders.filter((r): r is MedReminder => !!r && typeof r.id === 'string' && typeof r.name === 'string' && typeof r.time === 'string').slice(0, 50)
    : [];
  const p = (raw.prefs ?? {}) as Partial<Prefs>;
  return {
    wizard: { step: wiz.step, completed: wiz.completed },
    verified: raw.verified && typeof raw.verified === 'object' ? { ...raw.verified } : {},
    pinmap: pm,
    electrical: el,
    costs,
    reminders,
    prefs: { theme: p.theme === 'light' ? 'light' : 'dark', sound: p.sound !== false, speech: p.speech === true },
  };
}

export class AppStore {
  private data: AppData;
  private listeners = new Set<Listener>();
  constructor(private persist = true, initial?: Partial<AppData>) {
    this.data = sanitizeData(initial ?? (persist ? readJSON<Partial<AppData>>('app', {}) : {}));
  }
  subscribe = (fn: Listener) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  get = () => this.data;
  set(patch: Partial<AppData>) {
    this.data = { ...this.data, ...patch };
    if (this.persist) writeJSON('app', this.data);
    this.listeners.forEach((l) => l());
  }
  // ---- helpers ----
  setWizard(w: Pick<WizardState, 'step' | 'completed'>) {
    this.set({ wizard: { step: w.step, completed: w.completed } });
  }
  setVerified(id: string, signature: string | null) {
    const v = { ...this.data.verified };
    if (signature) v[id] = signature;
    else delete v[id];
    this.set({ verified: v });
  }
  clearVerified() {
    this.set({ verified: {} });
  }
  addReminder(name: string, time: string): MedReminder {
    const r: MedReminder = { id: uid('rem'), name: name.trim(), time, enabled: true };
    this.set({ reminders: [...this.data.reminders, r] });
    return r;
  }
  patchReminder = (id: string, patch: Partial<MedReminder>) => {
    this.set({ reminders: this.data.reminders.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
  };
  removeReminder(id: string) {
    this.set({ reminders: this.data.reminders.filter((r) => r.id !== id) });
  }
  resetAll() {
    this.data = sanitizeData({});
    if (this.persist) {
      writeJSON('app', this.data);
      removeKey('events');
    }
    this.listeners.forEach((l) => l());
  }
}

export const app = new AppStore(true);

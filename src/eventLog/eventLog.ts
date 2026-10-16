import type { Delivery, EventRecord, EventType } from '../types';
import { readJSON, writeJSON } from '../utilities/storage';
import { uid } from '../utilities/rng';

const KEY = 'events';
const MAX = 500;

type Listener = () => void;

/** Which device an event originates from; decides whether it needs the (simulated) network to be acknowledged. */
export type EventDevice = 'robot' | 'wearable' | 'local';

export interface LoggedEvent extends EventRecord {
  device: EventDevice;
  queuedAt: number;
}

export class EventLog {
  private events: LoggedEvent[];
  private listeners = new Set<Listener>();
  private snapshot: readonly LoggedEvent[];
  constructor(private persist = true, initial?: LoggedEvent[]) {
    this.events = initial ?? (persist ? readJSON<LoggedEvent[]>(KEY, []) : []);
    this.snapshot = [...this.events];
  }

  subscribe = (fn: Listener) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.snapshot;

  private commit() {
    if (this.events.length > MAX) this.events = this.events.slice(-MAX);
    this.snapshot = [...this.events];
    if (this.persist) writeJSON(KEY, this.events);
    this.listeners.forEach((l) => l());
  }

  add(e: {
    type: EventType;
    title: string;
    detail?: string;
    severity?: EventRecord['severity'];
    device?: EventDevice;
    delivery?: Delivery;
    needsReview?: boolean;
    ts?: number;
  }): LoggedEvent {
    const device = e.device ?? 'local';
    const rec: LoggedEvent = {
      id: uid('ev'),
      ts: e.ts ?? Date.now(),
      type: e.type,
      severity: e.severity ?? 'info',
      title: e.title,
      detail: e.detail ?? '',
      source: 'simulation',
      delivery: e.delivery ?? (device === 'local' ? 'local' : 'pending'),
      needsReview: e.needsReview,
      reviewed: false,
      device,
      queuedAt: e.ts ?? Date.now(),
    };
    this.events.push(rec);
    this.commit();
    return rec;
  }

  update(id: string, patch: Partial<LoggedEvent>) {
    const i = this.events.findIndex((x) => x.id === id);
    if (i < 0) return;
    this.events[i] = { ...this.events[i], ...patch };
    this.commit();
  }

  patchMany(fn: (e: LoggedEvent) => Partial<LoggedEvent> | null) {
    let changed = false;
    this.events = this.events.map((e) => {
      const p = fn(e);
      if (p) {
        changed = true;
        return { ...e, ...p };
      }
      return e;
    });
    if (changed) this.commit();
  }

  clear() {
    this.events = [];
    this.commit();
  }

  all(): readonly LoggedEvent[] {
    return this.snapshot;
  }
  has(type: EventType | EventType[]): boolean {
    const t = Array.isArray(type) ? type : [type];
    return this.events.some((e) => t.includes(e.type));
  }
}

export const eventLog = new EventLog(true);

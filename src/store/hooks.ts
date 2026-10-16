import { useMemo, useRef, useSyncExternalStore } from 'react';
import { app, type AppData } from './app';
import { eventLog } from '../eventLog/eventLog';
import { sim } from '../simulation/instance';
import type { FastState, SlowState } from '../simulation/engine';

export function useApp(): AppData {
  return useSyncExternalStore(app.subscribe, app.get, app.get);
}
export function useSlow(): SlowState {
  return useSyncExternalStore((fn) => sim.subscribe('slow', fn), sim.getSlow, sim.getSlow);
}
export function useFast(): FastState {
  return useSyncExternalStore((fn) => sim.subscribe('fast', fn), sim.getFast, sim.getFast);
}
export function useEvents() {
  return useSyncExternalStore(eventLog.subscribe, eventLog.getSnapshot, eventLog.getSnapshot);
}

/** derived flags used by the wizard gate */
export function useStable<T>(v: T, key: unknown): T {
  const ref = useRef(v);
  const keyRef = useRef(key);
  if (keyRef.current !== key) {
    keyRef.current = key;
    ref.current = v;
  }
  return useMemo(() => ref.current, [key]);
}

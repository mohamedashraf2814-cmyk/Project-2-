import type { MedReminder } from '../types';
import { dayKey, hhmm } from '../utilities/rng';

export interface ActiveAlert {
  id: string;
  reminderId: string | null;
  name: string;
  time: string;
  test: boolean;
  firedAt: number;
  state: 'ringing' | 'received' | 'dismissed';
}

export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function validateReminder(name: string, time: string): string | null {
  if (!name.trim()) return 'اكتب اسم الدواء.';
  if (name.trim().length > 60) return 'اسم الدواء طويل جدًا (60 حرفًا كحد أقصى).';
  if (!TIME_RE.test(time)) return 'أدخل وقتًا صحيحًا بصيغة HH:MM.';
  return null;
}

/** reminders that should ring now: enabled, minute matches and not already fired today */
export function dueReminders(list: MedReminder[], now: Date): MedReminder[] {
  const t = hhmm(now);
  const day = dayKey(now);
  return list.filter((r) => r.enabled && r.time === t && r.lastFiredDay !== day);
}

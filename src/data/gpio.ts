import type { PinMap, SignalKey, SignalSpec, Severity } from '../types';

export const SIGNALS: SignalSpec[] = [
  { key: 'AIN1', label: 'AIN1 — اتجاه المحرك الأيسر', dir: 'out', device: 'robot' },
  { key: 'AIN2', label: 'AIN2 — اتجاه المحرك الأيسر', dir: 'out', device: 'robot' },
  { key: 'PWMA', label: 'PWMA — سرعة المحرك الأيسر', dir: 'out', device: 'robot' },
  { key: 'BIN1', label: 'BIN1 — اتجاه المحرك الأيمن', dir: 'out', device: 'robot' },
  { key: 'BIN2', label: 'BIN2 — اتجاه المحرك الأيمن', dir: 'out', device: 'robot' },
  { key: 'PWMB', label: 'PWMB — سرعة المحرك الأيمن', dir: 'out', device: 'robot' },
  { key: 'STBY', label: 'STBY — تمكين المشغّل', dir: 'out', device: 'robot' },
  { key: 'TRIG', label: 'TRIG — إطلاق حساس المسافة', dir: 'out', device: 'robot' },
  { key: 'ECHO', label: 'ECHO — قراءة الصدى (بعد المقسّم)', dir: 'in', device: 'robot' },
  { key: 'SDA', label: 'SDA — I2C للشاشة', dir: 'i2c', device: 'robot' },
  { key: 'SCL', label: 'SCL — I2C للشاشة', dir: 'i2c', device: 'robot' },
  { key: 'BUZ', label: 'BUZ — الجرس (عبر الترانزستور)', dir: 'out', device: 'robot' },
  { key: 'BTN', label: 'BTN — زر الطوارئ', dir: 'in', device: 'robot' },
  { key: 'W_SDA', label: 'SDA — I2C لحساس MPU6050', dir: 'i2c', device: 'wearable' },
  { key: 'W_SCL', label: 'SCL — I2C لحساس MPU6050', dir: 'i2c', device: 'wearable' },
  { key: 'W_BTN', label: 'BTN — زر طوارئ السوار', dir: 'in', device: 'wearable' },
];

/** Example pin map for an ESP32 DevKit V1. Configurable in project settings. */
export const DEFAULT_PINMAP: PinMap = {
  AIN1: 26, AIN2: 25, PWMA: 33,
  BIN1: 16, BIN2: 17, PWMB: 18,
  STBY: 27,
  TRIG: 23, ECHO: 35,
  SDA: 21, SCL: 22,
  BUZ: 19, BTN: 4,
  W_SDA: 21, W_SCL: 22, W_BTN: 4,
};

/** GPIO numbers that physically exist on the 30-pin DevKit V1 header. */
export const HEADER_GPIOS = [0, 1, 2, 3, 4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33, 34, 35, 36, 39];
export const INPUT_ONLY = [34, 35, 36, 39];
export const STRAPPING = [0, 2, 5, 12, 15];
export const UART0 = [1, 3];
export const FLASH = [6, 7, 8, 9, 10, 11];

export interface PinIssue {
  status: Severity;
  reason: string;
}

export function gpioIssue(gpio: number, spec: SignalSpec): PinIssue {
  if (!Number.isInteger(gpio)) return { status: 'fail', reason: 'رقم الدبوس غير صالح.' };
  if (FLASH.includes(gpio)) return { status: 'fail', reason: `GPIO${gpio} متصل بذاكرة الفلاش الداخلية ولا يجوز استخدامه.` };
  if (!HEADER_GPIOS.includes(gpio)) return { status: 'fail', reason: `GPIO${gpio} غير موجود على لوحة ESP32 DevKit V1 ذات 30 دبوسًا.` };
  if (INPUT_ONLY.includes(gpio)) {
    if (spec.dir === 'out' || spec.dir === 'i2c') return { status: 'fail', reason: `GPIO${gpio} للإدخال فقط ولا يمكن استخدامه كخرج أو لـ I2C.` };
    if (spec.key === 'BTN' || spec.key === 'W_BTN') return { status: 'warn', reason: `GPIO${gpio} بلا مقاومة سحب داخلية؛ أضف مقاومة سحب خارجية للزر.` };
    return { status: 'ok', reason: `GPIO${gpio} إدخال فقط — مناسب لقراءة ${spec.key}.` };
  }
  if (gpio === 12) return { status: 'fail', reason: 'GPIO12 يحدد جهد الفلاش عند الإقلاع؛ وجود مستوى عالٍ عليه عند التشغيل قد يمنع الإقلاع. تجنّبه.' };
  if (STRAPPING.includes(gpio)) return { status: 'warn', reason: `GPIO${gpio} دبوس إقلاع (strapping)؛ قد يتغير سلوك الإقلاع إذا فرض الحمل مستوى عليه عند التشغيل.` };
  if (UART0.includes(gpio)) return { status: 'warn', reason: `GPIO${gpio} مستخدم في UART0 للبرمجة وسجل الإقلاع.` };
  return { status: 'ok', reason: `GPIO${gpio} مناسب.` };
}

export interface PinMapReport {
  perSignal: Record<SignalKey, PinIssue>;
  duplicates: { gpio: number; keys: SignalKey[]; device: string }[];
  hasFail: boolean;
}

export function validatePinMap(map: PinMap): PinMapReport {
  const perSignal = {} as Record<SignalKey, PinIssue>;
  for (const s of SIGNALS) perSignal[s.key] = gpioIssue(map[s.key], s);
  const duplicates: PinMapReport['duplicates'] = [];
  for (const device of ['robot', 'wearable']) {
    const seen = new Map<number, SignalKey[]>();
    for (const s of SIGNALS.filter((x) => x.device === device)) {
      const list = seen.get(map[s.key]) ?? [];
      list.push(s.key);
      seen.set(map[s.key], list);
    }
    for (const [gpio, keys] of seen) if (keys.length > 1) duplicates.push({ gpio, keys, device });
  }
  for (const d of duplicates) for (const k of d.keys) perSignal[k] = { status: 'fail', reason: `GPIO${d.gpio} مستخدم لأكثر من إشارة (${d.keys.join('، ')}).` };
  const hasFail = Object.values(perSignal).some((v) => v.status === 'fail');
  return { perSignal, duplicates, hasFail };
}

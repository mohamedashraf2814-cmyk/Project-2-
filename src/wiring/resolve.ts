import type { Endpoint, PinMap, SignalKey, Vec3, WireDef } from '../types';
import { SIGNALS, gpioIssue, validatePinMap } from '../data/gpio';
import { instanceById } from '../data/instances';
import { partById } from '../data/parts';
import { modelOf } from '../scenes/models';
import { rotY } from '../engine/math';

export interface Resolved {
  part: string;
  pin: string;
  label: string;
  signal?: SignalKey;
  gpio?: number;
}

export function resolveEndpoint(ep: Endpoint, map: PinMap): Resolved {
  if (ep.pin.startsWith('@')) {
    const key = ep.pin.slice(1) as SignalKey;
    const gpio = map[key];
    return { part: ep.part, pin: `GPIO${gpio}`, label: `GPIO${gpio} (${key})`, signal: key, gpio };
  }
  return { part: ep.part, pin: ep.pin, label: ep.pin };
}

export function pinExists(part: string, pin: string): boolean {
  const inst = instanceById(part);
  if (!inst) return false;
  const info = partById(inst.part);
  if (!info) return false;
  return modelOf(info.model).pins.some((p) => p.id === pin);
}

export function partNameOf(instanceId: string): string {
  const inst = instanceById(instanceId);
  return inst?.label ?? instanceId;
}

export interface Safety {
  safe: boolean;
  reasons: string[];
}

/** A wire is only animated as correct when every endpoint exists and the pin map is electrically sound. */
export function wireSafety(w: WireDef, map: PinMap, all: WireDef[] = []): Safety {
  const reasons: string[] = [];
  const report = validatePinMap(map);
  for (const ep of [w.from, w.to]) {
    const r = resolveEndpoint(ep, map);
    if (!pinExists(r.part, r.pin)) reasons.push(`الدبوس ${r.pin} غير موجود على ${partNameOf(r.part)}.`);
    if (r.signal) {
      const spec = SIGNALS.find((s) => s.key === r.signal)!;
      const issue = report.perSignal[r.signal] ?? gpioIssue(r.gpio!, spec);
      if (issue.status === 'fail') reasons.push(issue.reason);
    }
  }
  // direct 5 V echo into an ESP32 pin
  const touches = (e: Endpoint, part: string, pin: string) => e.part === part && e.pin === pin;
  if ((touches(w.from, 'us', 'ECHO') && w.to.part === 'esp') || (touches(w.to, 'us', 'ECHO') && w.from.part === 'esp'))
    reasons.push('ECHO يخرج 5 فولت: لا يجوز توصيله بدبوس ESP32 مباشرة (استخدم مقسّم الجهد).');
  // motors straight to ESP32
  if ((w.from.part.startsWith('motor') && w.to.part === 'esp') || (w.to.part.startsWith('motor') && w.from.part === 'esp'))
    reasons.push('المحرك لا يُوصَّل بدبابيس ESP32 مباشرة.');
  if ((w.from.part === 'esp' && w.to.part === 'buz') || (w.to.part === 'esp' && w.from.part === 'buz'))
    reasons.push('الجرس يحتاج مشغّل ترانزستور ولا يُوصَّل بدبوس ESP32 مباشرة.');
  if (w.to.part === 'drv' && w.to.pin === 'VM' && w.from.part === 'esp') reasons.push('دبوس VM يجب ألا يُغذّى من ESP32.');
  void all;
  return { safe: reasons.length === 0, reasons };
}

export function pinWorld(instId: string, pinId: string, layout: 'home' | 'wire', offset: Vec3 = [0, 0, 0]): Vec3 | null {
  const inst = instanceById(instId);
  const info = inst && partById(inst.part);
  if (!inst || !info) return null;
  const pin = modelOf(info.model).pins.find((p) => p.id === pinId);
  if (!pin) return null;
  const scale = layout === 'wire' ? 2.2 : 1;
  const base = layout === 'wire' ? inst.wire : inst.home;
  const rot = layout === 'wire' ? inst.wireRotY ?? 0 : inst.rotY ?? 0;
  const v = rotY([pin.pos[0] * scale, pin.pos[1] * scale, pin.pos[2] * scale], rot);
  return [base[0] + v[0] + offset[0], base[1] + v[1] + offset[1], base[2] + v[2] + offset[2]];
}

/** Smooth arc between two points, lifted over the board; `lift` separates overlapping wires. */
export function wirePath(a: Vec3, b: Vec3, lift: number, steps = 22): Vec3[] {
  const out: Vec3[] = [];
  const c1: Vec3 = [a[0], a[1] + lift, a[2]];
  const c2: Vec3 = [b[0], b[1] + lift, b[2]];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    out.push([
      u * u * u * a[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * b[0],
      u * u * u * a[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * b[1],
      u * u * u * a[2] + 3 * u * u * t * c1[2] + 3 * u * t * t * c2[2] + t * t * t * b[2],
    ]);
  }
  return out;
}

export interface Pick {
  part: string;
  pin: string;
}

export type VerifyOutcome = { ok: true } | { ok: false; reason: 'unsafe' | 'wrong_part' | 'wrong_pin'; message: string };

/** The user must name the destination pin. Only an exact match against the structured wire marks it verified. */
export function attemptVerify(w: WireDef, map: PinMap, chosen: Pick, all: WireDef[] = []): VerifyOutcome {
  const safety = wireSafety(w, map, all);
  if (!safety.safe) return { ok: false, reason: 'unsafe', message: `لا يمكن اعتماد هذا التوصيل: ${safety.reasons[0]}` };
  const dest = resolveEndpoint(w.to, map);
  if (chosen.part !== dest.part) return { ok: false, reason: 'wrong_part', message: 'هذا الدبوس يخص مكوّنًا آخر. راجع الجدول وتتبّع السلك.' };
  if (chosen.pin !== dest.pin) return { ok: false, reason: 'wrong_pin', message: 'المكوّن صحيح لكن الدبوس غير صحيح. راجع أسماء الدبابيس على القطعة.' };
  return { ok: true };
}

/** signature of a wire as currently resolved; a stored verification only counts while it still matches */
export function wireSignature(w: WireDef, map: PinMap): string {
  const a = resolveEndpoint(w.from, map);
  const b = resolveEndpoint(w.to, map);
  return `${a.part}.${a.pin}>${b.part}.${b.pin}`;
}

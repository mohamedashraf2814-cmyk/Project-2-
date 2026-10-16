import type { CheckResult, PinMap, WireDef } from '../types';
import { SIGNALS, validatePinMap } from '../data/gpio';
import { WIRES } from '../data/wires';
import { wireSafety } from './resolve';

export interface ElectricalConfig {
  /** worst-case stall current of ONE motor, in amperes */
  motorStallA: number;
  /** supply voltage fed to VM, in volts */
  motorVoltage: number;
}

export const DEFAULT_ELECTRICAL: ElectricalConfig = { motorStallA: 0.8, motorVoltage: 6 };

class UF {
  p = new Map<string, string>();
  find(x: string): string {
    if (!this.p.has(x)) this.p.set(x, x);
    let r = x;
    while (this.p.get(r) !== r) r = this.p.get(r)!;
    this.p.set(x, r);
    return r;
  }
  union(a: string, b: string) {
    this.p.set(this.find(a), this.find(b));
  }
}

const norm = (part: string, pin: string) => (/^GND\d*$/.test(pin) || /^(IN-|OUT-|B-)$/.test(pin) ? `${part}.GND` : `${part}.${pin}`);

export function groundConnected(wires: WireDef[], a: string, b: string): boolean {
  const uf = new UF();
  for (const w of wires) if (w.kind === 'ground') uf.union(norm(w.from.part, w.from.pin), norm(w.to.part, w.to.pin));
  return uf.find(a) === uf.find(b);
}

export function runChecks(map: PinMap, cfg: ElectricalConfig = DEFAULT_ELECTRICAL, wires: WireDef[] = WIRES): CheckResult[] {
  const out: CheckResult[] = [];
  const rep = validatePinMap(map);

  // 1 GPIO suitability
  const bad = SIGNALS.filter((s) => rep.perSignal[s.key].status === 'fail');
  const warn = SIGNALS.filter((s) => rep.perSignal[s.key].status === 'warn');
  out.push({
    id: 'gpio',
    title: 'ملاءمة دبابيس GPIO',
    status: bad.length ? 'fail' : warn.length ? 'warn' : 'ok',
    detail: bad.length
      ? `دبابيس غير صالحة: ${bad.map((s) => `${s.key} (GPIO${map[s.key]})`).join('، ')} — ${rep.perSignal[bad[0].key].reason}`
      : warn.length
        ? `تنبيهات: ${warn.map((s) => `${s.key} (GPIO${map[s.key]})`).join('، ')} — ${rep.perSignal[warn[0].key].reason}`
        : 'كل الإشارات على دبابيس مناسبة: لا فلاش ولا دبابيس إدخال-فقط للخرج ولا دبابيس إقلاع حساسة.',
  });

  // 2 logic levels
  const directEcho = wires.some((w) => (w.from.part === 'us' && w.from.pin === 'ECHO' && w.to.part === 'esp') || (w.to.part === 'us' && w.to.pin === 'ECHO' && w.from.part === 'esp'));
  const echoViaDivider = wires.some((w) => w.from.part === 'us' && w.from.pin === 'ECHO' && w.to.part === 'div') && wires.some((w) => w.from.part === 'div' && w.from.pin === 'OUT' && w.to.part === 'esp');
  out.push({
    id: 'logic',
    title: 'مستوى جهد ECHO (5 فولت ← 3.3 فولت)',
    status: directEcho ? 'fail' : echoViaDivider ? 'ok' : 'fail',
    detail: directEcho
      ? 'ECHO متصل مباشرة بدبوس ESP32 (5 فولت على دبوس 3.3 فولت). أضف مقسّم جهد 1k/2k.'
      : echoViaDivider
        ? 'ECHO يمرّ عبر مقسّم 1k/2k فيصل بنحو 3.3 فولت. دبابيس ESP32 لا تتحمل 5 فولت.'
        : 'لا يوجد مسار آمن لـ ECHO.',
  });

  // 3 motors never on GPIO
  const motorOnGpio = wires.some((w) => (w.from.part.startsWith('motor') && w.to.part === 'esp') || (w.to.part.startsWith('motor') && w.from.part === 'esp'));
  const motorsOnDriver = wires.filter((w) => w.from.part === 'drv' && w.to.part.startsWith('motor')).length === 4;
  out.push({
    id: 'motors',
    title: 'المحركات عبر المشغّل فقط',
    status: motorOnGpio ? 'fail' : motorsOnDriver ? 'ok' : 'fail',
    detail: motorOnGpio ? 'محرك موصول بدبابيس ESP32 مباشرة — خطأ.' : motorsOnDriver ? 'المحركان متصلان بمخارج TB6612 (A وB) ولا يلمسان ESP32.' : 'مخارج المشغّل غير مكتملة.',
  });

  // 4 motor supply separated
  const vm = wires.find((w) => w.to.part === 'drv' && w.to.pin === 'VM');
  out.push({
    id: 'vm',
    title: 'تغذية المحركات منفصلة عن المنطق',
    status: vm && vm.from.part === 'buck6' ? 'ok' : 'fail',
    detail: vm && vm.from.part === 'buck6' ? 'VM من منظم المحركات؛ المنطق (VCC) من 3V3 في ESP32.' : 'يجب أن يأتي VM من منظم المحركات وليس من ESP32.',
  });

  // 5 common ground
  const g1 = groundConnected(wires, 'esp.GND', 'drv.GND');
  const g2 = groundConnected(wires, 'esp.GND', 'batt.-');
  const g3 = groundConnected(wires, 'esp.GND', 'us.GND') && groundConnected(wires, 'esp.GND', 'oled.GND');
  out.push({
    id: 'gnd',
    title: 'أرضي مشترك',
    status: g1 && g2 && g3 ? 'ok' : 'fail',
    detail: g1 && g2 && g3 ? 'ESP32 والمشغّل والبطارية والحساسات على أرضي واحد.' : 'يوجد مكوّن بلا أرضي مشترك؛ ستفشل الإشارات.',
  });

  // 6 driver current
  const stall = cfg.motorStallA;
  out.push({
    id: 'current',
    title: 'تيار المشغّل (TB6612: 1.2 أ مستمر / 3.2 أ ذروة)',
    status: stall <= 1.2 ? 'ok' : stall <= 3.2 ? 'warn' : 'fail',
    detail:
      stall <= 1.2
        ? `تيار توقف المحرك ${stall} أ ضمن الحد المستمر للقناة.`
        : stall <= 3.2
          ? `تيار التوقف ${stall} أ يتجاوز الحد المستمر 1.2 أ (يتحمل ذروة قصيرة فقط). استخدم محركات أضعف أو مشغّلًا أقوى.`
          : `تيار التوقف ${stall} أ يتجاوز حتى ذروة 3.2 أ — لا يصلح هذا المشغّل.`,
  });

  // 7 motor voltage vs driver
  const v = cfg.motorVoltage;
  out.push({
    id: 'vm-range',
    title: 'جهد المحركات (VM: 4.5–13.5 فولت)',
    status: v >= 4.5 && v <= 13.5 ? 'ok' : 'fail',
    detail: v >= 4.5 && v <= 13.5 ? `${v} فولت ضمن نطاق TB6612. تأكد أنه يناسب جهد المحرك.` : `${v} فولت خارج نطاق TB6612.`,
  });

  // 8 battery protection and switch
  const switchOk = wires.some((w) => w.from.part === 'batt' && w.from.pin === '+' && w.to.part === 'sw');
  out.push({
    id: 'battery',
    title: 'البطارية (2S) والحماية والمفتاح',
    status: switchOk ? 'ok' : 'fail',
    detail: switchOk
      ? 'حزمة 2S (6.0–8.4 فولت) بلوحة BMS، ومفتاح على الموجب قبل المنظمات. المنظمان يتحملان 8.4 فولت.'
      : 'مفتاح الطاقة غير موجود في مسار الموجب.',
  });

  // 9 buzzer driver
  const buzDirect = wires.some((w) => (w.from.part === 'esp' && w.to.part === 'buz') || (w.to.part === 'esp' && w.from.part === 'buz'));
  out.push({
    id: 'buzzer',
    title: 'تيار الجرس عبر ترانزستور',
    status: buzDirect ? 'fail' : wires.some((w) => w.from.part === 'npn' && w.to.part === 'buz') ? 'ok' : 'fail',
    detail: buzDirect ? 'الجرس على دبوس ESP32 مباشرة (تيار أعلى من الموصى به).' : 'الجرس يُقاد عبر NPN فلا يتحمّل دبوس ESP32 تياره.',
  });

  // 10 safe startup
  out.push({
    id: 'startup',
    title: 'إقلاع وإيقاف آمنان',
    status: rep.perSignal.STBY.status === 'fail' ? 'fail' : 'info',
    detail: 'ابدأ بـ STBY منخفضًا (مقاومة سحب 10 كيلو أوم)، ولا ترفعه إلا بعد تهيئة البرنامج؛ وعند الإيقاف اجعل PWM = 0 ثم STBY منخفضًا، وأوقف المحركات عند فقدان الحساس أو الاتصال.',
  });

  // 11 every wire safe
  const unsafe = wires.filter((w) => !wireSafety(w, map, wires).safe);
  out.push({
    id: 'wires',
    title: 'سلامة كل التوصيلات المعرّفة',
    status: unsafe.length ? 'fail' : 'ok',
    detail: unsafe.length ? `توصيلات غير آمنة: ${unsafe.map((w) => w.id).join('، ')}.` : `${wires.length} توصيلًا بلا مخالفات معروفة.`,
  });
  return out;
}

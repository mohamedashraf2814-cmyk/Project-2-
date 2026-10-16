import type { PartModel, PinDef, PinRole, RGB, Shape, Vec3 } from '../types';

const C = {
  pcbBlack: [28, 34, 46] as RGB,
  pcbBlue: [14, 82, 168] as RGB,
  pcbRed: [168, 28, 40] as RGB,
  pcbGreen: [16, 110, 70] as RGB,
  metal: [190, 198, 210] as RGB,
  gold: [214, 176, 70] as RGB,
  black: [18, 20, 26] as RGB,
  dark: [40, 46, 58] as RGB,
  white: [232, 236, 242] as RGB,
  yellow: [236, 196, 40] as RGB,
  red: [214, 48, 48] as RGB,
  acrylic: [150, 196, 226] as RGB,
  rubber: [26, 28, 32] as RGB,
  orange: [232, 120, 40] as RGB,
  lipo: [210, 170, 60] as RGB,
  teal: [20, 150, 160] as RGB,
};

const B = (size: Vec3, offset: Vec3, color: RGB): Shape => ({ type: 'box', size, offset, color });
const Cy = (r: number, h: number, axis: 'x' | 'y' | 'z', offset: Vec3, color: RGB, seg = 14): Shape => ({ type: 'cyl', r, h, axis, offset, color, seg });

export function roleOf(id: string): PinRole {
  const u = id.toUpperCase();
  if (/^(GND|AD0)/.test(u) || u === '-' || u === 'IN-' || u === 'OUT-' || u === 'B-' || u === 'E') return 'ground';
  if (/^(VIN|VM|VCC|3V3|5V)$/.test(u) || u === '+' || u === 'IN+' || u === 'OUT+' || u === 'B+') return 'power';
  if (/^(SDA|SCL)$/.test(u)) return 'i2c';
  if (/^(AO|BO|AIN|BIN|PWM|STBY)/.test(u)) return u.startsWith('STBY') || u.startsWith('PWM') || u.startsWith('AIN') || u.startsWith('BIN') ? 'motor' : 'motor';
  return 'digital';
}

const pin = (id: string, pos: Vec3, label = id, role?: PinRole): PinDef => ({ id, label, role: role ?? roleOf(id), pos });
const row = (ids: string[], x0: number, z0: number, dx: number, dz: number, y: number, labels?: string[]): PinDef[] =>
  ids.map((id, i) => pin(id, [x0 + dx * i, y, z0 + dz * i], labels?.[i] ?? id));

// ---------- ESP32 DevKit V1 (30 pin) ----------
const ESP_LEFT = ['EN', 'GPIO36', 'GPIO39', 'GPIO34', 'GPIO35', 'GPIO32', 'GPIO33', 'GPIO25', 'GPIO26', 'GPIO27', 'GPIO14', 'GPIO12', 'GPIO13', 'GND', 'VIN'];
const ESP_RIGHT = ['GPIO23', 'GPIO22', 'GPIO1', 'GPIO3', 'GPIO21', 'GPIO19', 'GPIO18', 'GPIO5', 'GPIO17', 'GPIO16', 'GPIO4', 'GPIO2', 'GPIO15', 'GND2', '3V3'];
const espLabel = (id: string) =>
  ({ GPIO36: 'VP·36', GPIO39: 'VN·39', EN: 'EN', GPIO1: 'TX0·1', GPIO3: 'RX0·3', GPIO17: 'TX2·17', GPIO16: 'RX2·16' } as Record<string, string>)[id] ?? id.replace('GPIO', 'D');
const espPins = (): PinDef[] => [
  ...row(ESP_LEFT, -1.27, -1.9, 0, 3.8 / 14, 0.62, ESP_LEFT.map(espLabel)),
  ...row(ESP_RIGHT, 1.27, -1.9, 0, 3.8 / 14, 0.62, ESP_RIGHT.map(espLabel)),
].map((p) => (p.id === 'EN' ? { ...p, role: 'digital' as PinRole } : p));

const esp32: PartModel = {
  size: [2.8, 1.2, 5.6],
  shapes: [
    B([2.8, 0.16, 5.6], [0, 0.35, 0], C.pcbBlack),
    B([1.8, 0.3, 2.5], [0, 0.58, 1.3], C.metal), // module shield
    B([1.8, 0.1, 1.0], [0, 0.45, 2.55], C.dark), // antenna keep-out
    B([0.9, 0.35, 0.8], [0, 0.58, -2.6], C.metal), // micro-USB
    B([0.4, 0.25, 0.4], [-0.9, 0.52, -2.0], C.white),
    B([0.4, 0.25, 0.4], [0.9, 0.52, -2.0], C.white),
    B([0.254, 0.5, 3.8], [-1.27, 0.5, 0], C.black),
    B([0.254, 0.5, 3.8], [1.27, 0.5, 0], C.black),
  ],
  pins: espPins(),
};

// ---------- TB6612FNG breakout ----------
const TB_L = ['VM', 'VCC', 'GND', 'AO1', 'AO2', 'BO2', 'BO1', 'GND2'];
const TB_R = ['PWMA', 'AIN2', 'AIN1', 'STBY', 'BIN1', 'BIN2', 'PWMB', 'GND3'];
const tb6612: PartModel = {
  size: [3.2, 0.9, 2.6],
  shapes: [
    B([3.2, 0.15, 2.6], [0, 0.3, 0], C.pcbRed),
    B([0.9, 0.25, 0.9], [0, 0.5, 0], C.black),
    B([0.5, 0.35, 0.5], [-1.0, 0.55, 0.5], C.metal),
    B([0.5, 0.35, 0.5], [1.0, 0.55, 0.5], C.metal),
    B([0.254, 0.4, 2.2], [-1.4, 0.45, 0], C.black),
    B([0.254, 0.4, 2.2], [1.4, 0.45, 0], C.black),
  ],
  pins: [
    ...row(TB_L, -1.4, -1.0, 0, 2.0 / 7, 0.7),
    ...row(TB_R, 1.4, -1.0, 0, 2.0 / 7, 0.7),
  ],
};

// ---------- DC geared motor (TT type) ----------
const motor: PartModel = {
  size: [2.2, 2.2, 6.5],
  shapes: [
    B([2.2, 2.2, 6.5], [0, 1.1, 0], C.yellow),
    B([1.0, 1.0, 1.4], [0, 1.1, 3.9], C.dark),
    Cy(0.38, 3.2, 'x', [0.0, 1.1, -1.8], C.metal, 10),
    B([0.5, 0.12, 0.5], [0, 2.26, -3.35], C.gold),
  ],
  pins: [pin('+', [0.4, 2.35, -3.35], '+', 'motor'), pin('-', [-0.4, 2.35, -3.35], '−', 'motor')],
};

const wheel: PartModel = {
  size: [2.6, 6.6, 6.6],
  shapes: [Cy(3.3, 2.6, 'x', [0, 3.3, 0], C.rubber, 22), Cy(1.6, 2.7, 'x', [0, 3.3, 0], C.white, 14), Cy(0.4, 2.9, 'x', [0, 3.3, 0], C.metal, 8)],
  pins: [],
};
const caster: PartModel = {
  size: [2.4, 3.4, 2.4],
  shapes: [Cy(1.2, 2.4, 'y', [0, 1.2, 0], C.metal, 14), Cy(0.35, 1.4, 'y', [0, 3.0, 0], C.dark, 8)],
  pins: [],
};

// ---------- chassis (acrylic two-plate) ----------
const chassis: PartModel = {
  size: [15, 1, 22],
  shapes: [
    B([15, 0.4, 22], [0, 4.8, 0], C.acrylic),
    B([0.6, 0.6, 3], [-6.0, 4.3, -3], C.dark),
    B([0.6, 0.6, 3], [6.0, 4.3, -3], C.dark),
  ],
  pins: [],
};

// ---------- breadboard ----------
const breadboard: PartModel = {
  size: [5.5, 0.9, 16.5],
  shapes: [
    B([5.5, 0.9, 16.5], [0, 0.45, 0], C.white),
    B([0.5, 0.05, 16], [0, 0.92, 0], [170, 176, 186]),
    B([0.12, 0.06, 16], [-2.35, 0.93, 0], C.red),
    B([0.12, 0.06, 16], [2.35, 0.93, 0], [40, 90, 200]),
  ],
  pins: [],
};

// ---------- HC-SR04 ----------
const hcsr04: PartModel = {
  size: [4.5, 2.0, 2.0],
  shapes: [
    B([4.5, 1.8, 0.15], [0, 1.1, 0], C.pcbBlue),
    Cy(0.82, 1.1, 'z', [-1.2, 1.2, 0.65], C.metal, 16),
    Cy(0.82, 1.1, 'z', [1.2, 1.2, 0.65], C.metal, 16),
    Cy(0.55, 0.12, 'z', [-1.2, 1.2, 1.25], C.dark, 12),
    Cy(0.55, 0.12, 'z', [1.2, 1.2, 1.25], C.dark, 12),
    B([0.9, 0.5, 0.3], [0, 0.55, -0.2], C.metal),
    B([1.2, 0.254, 0.254], [0, 0.45, -0.2], C.black),
  ],
  pins: row(['VCC', 'TRIG', 'ECHO', 'GND'], -0.381 * 1.5 * 2, -0.25, 0.508 * 1, 0, 0.1),
};
hcsr04.pins = ['VCC', 'TRIG', 'ECHO', 'GND'].map((id, i) => pin(id, [-0.9 + i * 0.6, 0.3, -0.3]));

// ---------- OLED 0.96" I2C (standing) ----------
const oled: PartModel = {
  size: [2.7, 2.7, 0.4],
  shapes: [
    B([2.7, 2.7, 0.15], [0, 1.35, 0], C.pcbBlue),
    B([2.5, 1.5, 0.12], [0, 1.45, 0.14], C.black),
    B([1.9, 0.9, 0.02], [0, 1.45, 0.21], [0, 150, 200]),
  ],
  pins: ['GND', 'VCC', 'SCL', 'SDA'].map((id, i) => pin(id, [-0.9 + i * 0.6, 2.7, 0])),
};

// ---------- active buzzer ----------
const buzzer: PartModel = {
  size: [2, 1.4, 1.6],
  shapes: [
    B([2.0, 0.15, 1.6], [0, 0.08, 0], C.pcbBlack),
    Cy(0.6, 0.85, 'y', [0, 0.55, 0], C.black, 16),
    Cy(0.12, 0.05, 'y', [0, 1.0, 0], C.dark, 8),
  ],
  pins: [pin('+', [-0.5, 0.2, -0.7], '+'), pin('-', [0.5, 0.2, -0.7], '−')],
};

// ---------- push button ----------
const button: PartModel = {
  size: [1.6, 1.0, 1.6],
  shapes: [B([1.6, 0.5, 1.6], [0, 0.25, 0], C.dark), Cy(0.55, 0.45, 'y', [0, 0.72, 0], C.red, 16)],
  pins: [pin('1', [-0.6, 0.5, -0.8]), pin('2', [0.6, 0.5, -0.8])],
};

// ---------- battery pack (2S 18650 holder with BMS) ----------
const battery: PartModel = {
  size: [3.8, 2.0, 7.8],
  shapes: [
    B([3.8, 1.9, 7.8], [0, 0.95, 0], C.dark),
    Cy(0.9, 7.2, 'z', [-0.95, 1.5, 0], [60, 130, 210], 14),
    Cy(0.9, 7.2, 'z', [0.95, 1.5, 0], [60, 130, 210], 14),
    B([3.2, 0.3, 1.1], [0, 1.95, -3.0], C.pcbGreen),
  ],
  pins: [pin('+', [0.8, 2.15, -3.4], '+'), pin('-', [-0.8, 2.15, -3.4], '−')],
};

// ---------- buck converter (LM2596 style) ----------
const buck: PartModel = {
  size: [4.4, 1.4, 2.1],
  shapes: [
    B([4.4, 0.15, 2.1], [0, 0.2, 0], C.teal),
    Cy(0.55, 1.0, 'y', [-0.9, 0.75, 0.3], C.black, 12),
    B([1.0, 0.7, 0.9], [0.9, 0.55, 0.2], C.dark),
    B([0.8, 0.6, 0.6], [0.2, 0.55, -0.5], [60, 120, 200]),
  ],
  pins: [
    pin('IN+', [-2.0, 0.4, -0.7], 'IN+'),
    pin('IN-', [-2.0, 0.4, 0.7], 'IN−'),
    pin('OUT+', [2.0, 0.4, -0.7], 'OUT+'),
    pin('OUT-', [2.0, 0.4, 0.7], 'OUT−'),
  ],
};

// ---------- rocker switch ----------
const rocker: PartModel = {
  size: [2.1, 1.5, 1.4],
  shapes: [B([2.1, 1.0, 1.4], [0, 0.5, 0], C.black), B([1.6, 0.4, 1.0], [0, 1.1, 0], C.red)],
  pins: [pin('IN', [-0.6, 0.3, -0.75], 'IN', 'power'), pin('OUT', [0.6, 0.3, -0.75], 'OUT', 'power')],
};

// ---------- resistor divider (1k / 2k) ----------
const divider: PartModel = {
  size: [2.4, 0.6, 1.2],
  shapes: [
    B([2.4, 0.12, 1.2], [0, 0.1, 0], C.pcbGreen),
    Cy(0.15, 0.9, 'x', [-0.35, 0.3, 0.25], [210, 180, 130], 8),
    Cy(0.15, 0.9, 'x', [0.35, 0.3, -0.25], [210, 180, 130], 8),
  ],
  pins: [pin('IN', [-0.9, 0.3, -0.5], 'IN·5V', 'digital'), pin('OUT', [0, 0.3, -0.5], 'OUT·3.3V', 'digital'), pin('GND', [0.9, 0.3, -0.5], 'GND', 'ground')],
};

// ---------- NPN driver ----------
const npn: PartModel = {
  size: [2.0, 0.9, 1.2],
  shapes: [B([2.0, 0.12, 1.2], [0, 0.1, 0], C.pcbGreen), Cy(0.35, 0.6, 'y', [0, 0.45, 0.1], C.black, 10), Cy(0.12, 0.8, 'x', [-0.6, 0.3, -0.2], [210, 180, 130], 8)],
  pins: [pin('B', [-0.7, 0.25, -0.5], 'B', 'digital'), pin('C', [0, 0.25, -0.5], 'C', 'digital'), pin('E', [0.7, 0.25, -0.5], 'E', 'ground')],
};

// ---------- MPU6050 (GY-521) ----------
const mpu: PartModel = {
  size: [2.1, 0.8, 1.6],
  shapes: [B([2.1, 0.15, 1.6], [0, 0.1, 0], C.pcbBlue), B([0.4, 0.2, 0.4], [0, 0.28, 0], C.black), B([1.9, 0.25, 0.254], [0, 0.3, -0.6], C.black)],
  pins: ['VCC', 'GND', 'SCL', 'SDA', 'XDA', 'XCL', 'AD0', 'INT'].map((id, i) => pin(id, [-0.88 + i * 0.25, 0.5, -0.6])),
};

// ---------- LiPo cell ----------
const lipo: PartModel = {
  size: [3.4, 0.6, 5.0],
  shapes: [B([3.4, 0.55, 5.0], [0, 0.28, 0], C.lipo), B([2.2, 0.57, 1.0], [0, 0.29, 1.5], [150, 120, 40])],
  pins: [pin('+', [0.5, 0.6, -2.6], '+'), pin('-', [-0.5, 0.6, -2.6], '−')],
};

// ---------- TP4056 with protection ----------
const tp4056: PartModel = {
  size: [2.6, 0.8, 1.7],
  shapes: [B([2.6, 0.12, 1.7], [0, 0.1, 0], C.pcbBlue), B([0.9, 0.5, 0.9], [-0.9, 0.35, 0], C.metal), B([0.6, 0.2, 0.5], [0.5, 0.25, 0.3], C.black)],
  pins: [pin('OUT+', [0.9, 0.3, -0.8], 'OUT+'), pin('OUT-', [0.4, 0.3, -0.8], 'OUT−'), pin('B+', [-0.1, 0.3, -0.8], 'B+'), pin('B-', [-0.6, 0.3, -0.8], 'B−')],
};

// ---------- 5V boost ----------
const boost: PartModel = {
  size: [2.2, 1.0, 1.4],
  shapes: [B([2.2, 0.12, 1.4], [0, 0.1, 0], C.teal), B([0.9, 0.6, 0.9], [-0.3, 0.45, 0], C.dark)],
  pins: [pin('IN+', [-0.9, 0.3, -0.6], 'IN+'), pin('IN-', [-0.4, 0.3, -0.6], 'IN−'), pin('OUT+', [0.4, 0.3, -0.6], 'OUT+'), pin('OUT-', [0.9, 0.3, -0.6], 'OUT−')],
};

// ---------- wearable enclosure ----------
const wcase: PartModel = {
  size: [12, 1.6, 8],
  shapes: [
    B([9, 0.4, 8], [0, 0.2, 0], [210, 216, 226]),
    B([9, 1.0, 0.4], [0, 0.7, -3.8], [210, 216, 226]),
    B([9, 1.0, 0.4], [0, 0.7, 3.8], [210, 216, 226]),
    B([0.4, 1.0, 7.2], [-4.3, 0.7, 0], [210, 216, 226]),
    B([0.4, 1.0, 7.2], [4.3, 0.7, 0], [210, 216, 226]),
    B([3.2, 0.3, 4.2], [-6.1, 0.15, 0], C.dark),
    B([3.2, 0.3, 4.2], [6.1, 0.15, 0], C.dark),
  ],
  pins: [],
};

// ---------- optional ----------
const encoder: PartModel = {
  size: [3.0, 1.5, 2.0],
  shapes: [Cy(1.4, 0.2, 'y', [0, 0.7, 0], C.dark, 20), B([1.2, 0.8, 0.6], [1.2, 0.5, 0], C.pcbBlue), B([1.0, 0.25, 0.2], [0, 0.95, 0.9], C.black)],
  pins: ['VCC', 'GND', 'OUT'].map((id, i) => pin(id, [1.2 - 0.0, 0.95, -0.2 + i * 0.2])),
};
const camera: PartModel = {
  size: [2.5, 1.5, 3.2],
  shapes: [B([2.5, 0.2, 3.2], [0, 0.1, 0], C.pcbBlack), B([1.0, 0.8, 1.0], [0, 0.6, 0.6], C.black), Cy(0.35, 0.3, 'y', [0, 1.1, 0.6], [30, 60, 120], 12)],
  pins: [],
};

const jumpers: PartModel = {
  size: [6, 0.6, 3],
  shapes: [
    Cy(0.12, 6, 'x', [0, 0.2, -1], C.red, 6),
    Cy(0.12, 6, 'x', [0, 0.2, -0.4], C.black, 6),
    Cy(0.12, 6, 'x', [0, 0.2, 0.2], [60, 130, 220], 6),
    Cy(0.12, 6, 'x', [0, 0.2, 0.8], C.yellow, 6),
    Cy(0.12, 6, 'x', [0, 0.2, 1.4], [60, 180, 90], 6),
  ],
  pins: [],
};

export const MODELS: Record<string, PartModel> = {
  esp32, tb6612, motor, wheel, caster, chassis, breadboard, hcsr04, oled, buzzer, button, battery, buck, rocker, divider, npn, mpu, lipo, tp4056, boost, wcase, encoder, camera, jumpers,
};

export function modelOf(key: string): PartModel {
  return MODELS[key] ?? MODELS.chassis;
}

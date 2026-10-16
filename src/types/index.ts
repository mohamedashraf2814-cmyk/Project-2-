export type Vec3 = [number, number, number];
export type RGB = [number, number, number];

// ---------- 3D scene ----------
export type Shape =
  | { type: 'box'; size: Vec3; offset: Vec3; color: RGB; rotY?: number }
  | { type: 'cyl'; r: number; h: number; axis: 'x' | 'y' | 'z'; offset: Vec3; color: RGB; seg?: number };

export type PinRole = 'power' | 'ground' | 'digital' | 'i2c' | 'motor';

export interface PinDef {
  id: string;
  label: string;
  role: PinRole;
  /** local position (cm) relative to part origin, on the pin header / terminal */
  pos: Vec3;
  note?: string;
}

export interface PartModel {
  shapes: Shape[];
  pins: PinDef[];
  /** approximate footprint [w,h,d] in cm, used for layout and framing */
  size: Vec3;
}

// ---------- parts ----------
export type PartCategory = 'robot' | 'wearable' | 'optional';

export interface PartInfo {
  id: string;
  category: PartCategory;
  nameAr: string;
  nameEn: string;
  purpose: string;
  specs: string[];
  power: string;
  pinsNote: string;
  connect: string[];
  position: string;
  safety: string[];
  /** model key in scenes/models */
  model: string;
  tags?: string[];
}

export interface SceneInstance {
  id: string;
  part: string;
  group: 'robot' | 'wearable';
  stage: number; // stage at which it gets installed (1 = present from the beginning on the bench)
  home: Vec3;
  rotY?: number;
  /** resting place on the workbench before it is installed */
  bench: Vec3;
  benchRot?: number;
  /** wiring-lab layout */
  wire: Vec3;
  wireRotY?: number;
  /** approach offset when animating into place */
  from?: Vec3;
  label: string;
}

// ---------- wiring ----------
export type WireKind = 'power' | 'ground' | 'digital' | 'i2c' | 'motor';

export interface Endpoint {
  /** scene instance id */
  part: string;
  /** pin id, or "@SIGNAL" resolved through the configurable pin map */
  pin: string;
}

export interface WireDef {
  id: string;
  from: Endpoint;
  to: Endpoint;
  kind: WireKind;
  purpose: string;
  instruction: string;
  group: 'robot' | 'wearable';
  /** assembly stage in which the connection is made */
  stage: number;
  /** set on wires that carry 5 V logic into a 3.3 V pin without a divider (used only by the validator tests) */
  note?: string;
}

// ---------- GPIO / pin map ----------
export type SignalKey =
  | 'AIN1' | 'AIN2' | 'PWMA' | 'BIN1' | 'BIN2' | 'PWMB' | 'STBY'
  | 'TRIG' | 'ECHO' | 'SDA' | 'SCL' | 'BUZ' | 'BTN'
  | 'W_SDA' | 'W_SCL' | 'W_BTN';

export type PinMap = Record<SignalKey, number>;

export interface SignalSpec {
  key: SignalKey;
  label: string;
  dir: 'out' | 'in' | 'i2c';
  device: string;
}

export type Severity = 'ok' | 'info' | 'warn' | 'fail';
export interface CheckResult {
  id: string;
  title: string;
  status: Severity;
  detail: string;
}

// ---------- assembly ----------
export interface AssemblyStep {
  n: number;
  title: string;
  why: string;
  instructions: string[];
  highlight: string[]; // instance ids
  safety: string[];
  troubleshooting: { problem: string; fix: string }[];
  /** instance ids installed in this stage (animated) */
  installs: string[];
  /** shown group */
  view: 'robot' | 'wearable' | 'both';
}

// ---------- simulation ----------
export type RunStatus = 'stopped' | 'running' | 'paused';
export type SimMode = 'robot' | 'wearable' | 'medication' | 'caretwin';

export interface MedReminder {
  id: string;
  name: string;
  time: string; // HH:MM
  enabled: boolean;
  lastFiredDay?: string;
}

export type EventType =
  | 'sim_start' | 'sim_stop' | 'sim_pause'
  | 'obstacle_stop' | 'obstacle_avoid'
  | 'med_reminder' | 'med_ack' | 'med_dismiss'
  | 'fall_suspected' | 'fall_cancelled' | 'fall_notified'
  | 'emergency' | 'emergency_retry'
  | 'device_offline' | 'device_online' | 'internet_down' | 'internet_up'
  | 'sync' | 'assembly' | 'wiring' | 'system';

export type Delivery = 'local' | 'pending' | 'delivered_sim' | 'failed';

export interface EventRecord {
  id: string;
  ts: number;
  type: EventType;
  severity: 'info' | 'review' | 'alert';
  title: string;
  detail: string;
  source: 'simulation';
  /** local = only on this browser; pending = waiting for (simulated) server; delivered_sim = acknowledged by the simulated server; failed */
  delivery: Delivery;
  needsReview?: boolean;
  reviewed?: boolean;
}

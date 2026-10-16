/** Deterministic differential-drive robot with an ultrasonic range sensor. All values are SIMULATED. */
export type Cmd = 'stop' | 'forward' | 'backward' | 'left' | 'right';
export type Behavior = 'stop' | 'avoid';
export type RobotMode = 'idle' | 'manual' | 'avoiding' | 'blocked';

export interface Obstacle {
  id: number;
  x: number; // centre, cm
  z: number;
  w: number;
  d: number;
}

export interface RobotState {
  x: number;
  z: number;
  heading: number; // rad; forward vector = (sin h, cos h)
  cmd: Cmd;
  speedPct: number; // 10..100
  behavior: Behavior;
  patrol: boolean; // keep driving forward on its own (avoids / stops by behavior)
  dangerCm: number;
  mode: RobotMode;
  motorL: number; // -1..1 current motor output
  motorR: number;
  distance: number; // cm, last sensor reading (simulated)
  obstacles: Obstacle[];
  nextObstacleId: number;
  avoidTurn: number; // remaining radians to turn while avoiding
}

export const FLOOR = { halfX: 140, halfZ: 100 };
export const ROBOT_RADIUS = 12;
export const MAX_SPEED = 30; // cm/s at 100 %
export const WHEEL_BASE = 17; // cm
export const SENSOR_OFFSET = 11; // cm in front of the centre
export const SENSOR_RANGE = 400;
export const SENSOR_HALF_ANGLE = (7.5 * Math.PI) / 180;

export const initialRobot = (): RobotState => ({
  x: 0, z: -60, heading: 0, cmd: 'stop', speedPct: 60, behavior: 'stop', patrol: false, dangerCm: 25,
  mode: 'idle', motorL: 0, motorR: 0, distance: SENSOR_RANGE, obstacles: [], nextObstacleId: 1, avoidTurn: 0,
});

/** distance along a ray to an axis-aligned box (slab test); null if no hit */
function rayBox(ox: number, oz: number, dx: number, dz: number, b: Obstacle): number | null {
  const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2, z0 = b.z - b.d / 2, z1 = b.z + b.d / 2;
  let tmin = 0, tmax = Infinity;
  for (const [o, d, lo, hi] of [[ox, dx, x0, x1], [oz, dz, z0, z1]] as const) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return null;
    } else {
      let t1 = (lo - o) / d, t2 = (hi - o) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}

export function senseDistance(s: RobotState): number {
  const ox = s.x + Math.sin(s.heading) * SENSOR_OFFSET;
  const oz = s.z + Math.cos(s.heading) * SENSOR_OFFSET;
  let best = SENSOR_RANGE;
  const walls: Obstacle[] = [
    { id: -1, x: 0, z: FLOOR.halfZ + 5, w: FLOOR.halfX * 2 + 20, d: 10 },
    { id: -2, x: 0, z: -FLOOR.halfZ - 5, w: FLOOR.halfX * 2 + 20, d: 10 },
    { id: -3, x: FLOOR.halfX + 5, z: 0, w: 10, d: FLOOR.halfZ * 2 + 20 },
    { id: -4, x: -FLOOR.halfX - 5, z: 0, w: 10, d: FLOOR.halfZ * 2 + 20 },
  ];
  for (const k of [-1, -0.5, 0, 0.5, 1]) {
    const a = s.heading + k * SENSOR_HALF_ANGLE;
    const dx = Math.sin(a), dz = Math.cos(a);
    for (const b of [...walls, ...s.obstacles]) {
      const t = rayBox(ox, oz, dx, dz, b);
      if (t != null && t < best) best = t;
    }
  }
  return Math.max(2, Math.round(best * 10) / 10);
}

export interface RobotEvent {
  type: 'obstacle_stop' | 'obstacle_avoid';
  detail: string;
}

export function setCommand(s: RobotState, cmd: Cmd): RobotState {
  return { ...s, cmd, patrol: false, avoidTurn: 0, mode: cmd === 'stop' ? 'idle' : 'manual' };
}

export function addObstacleAhead(s: RobotState, distanceCm = 70): RobotState {
  const ox = s.x + Math.sin(s.heading) * distanceCm;
  const oz = s.z + Math.cos(s.heading) * distanceCm;
  const x = Math.max(-FLOOR.halfX + 12, Math.min(FLOOR.halfX - 12, ox));
  const z = Math.max(-FLOOR.halfZ + 12, Math.min(FLOOR.halfZ - 12, oz));
  return { ...s, obstacles: [...s.obstacles, { id: s.nextObstacleId, x, z, w: 24, d: 24 }], nextObstacleId: s.nextObstacleId + 1 };
}

export function clearObstacles(s: RobotState): RobotState {
  return { ...s, obstacles: [] };
}

export function stepRobot(prev: RobotState, dt: number): { state: RobotState; events: RobotEvent[] } {
  const events: RobotEvent[] = [];
  let s = { ...prev };
  s.distance = senseDistance(s);
  const speed = (s.speedPct / 100) * MAX_SPEED;

  let want: Cmd = s.cmd;
  if (s.patrol && s.cmd === 'stop') want = 'forward';

  // avoidance in progress: keep turning right until the way is clear and the planned angle is done
  if (s.avoidTurn > 0) {
    const turn = Math.min(s.avoidTurn, (speed / (WHEEL_BASE / 2)) * dt || 0.001);
    s.heading -= turn;
    s.avoidTurn -= turn;
    s.motorL = 0.5; s.motorR = -0.5;
    s.mode = 'avoiding';
    s.distance = senseDistance(s);
    if (s.avoidTurn <= 1e-6 && s.distance > s.dangerCm + 10) {
      s.mode = 'manual';
      s.avoidTurn = 0;
    } else if (s.avoidTurn <= 1e-6) {
      s.avoidTurn = 0.2; // still blocked: keep turning
    }
    return { state: s, events };
  }

  const blockedAhead = (want === 'forward') && s.distance <= s.dangerCm;
  if (blockedAhead) {
    if (s.behavior === 'avoid') {
      s.avoidTurn = Math.PI / 2;
      s.mode = 'avoiding';
      s.motorL = 0; s.motorR = 0;
      if (prev.mode !== 'avoiding') events.push({ type: 'obstacle_avoid', detail: `عائق على بعد ${s.distance} سم (محاكاة): الروبوت يدور لتفاديه.` });
      return { state: s, events };
    }
    s.motorL = 0; s.motorR = 0;
    if (prev.mode !== 'blocked') events.push({ type: 'obstacle_stop', detail: `عائق على بعد ${s.distance} سم (محاكاة) ضمن منطقة الخطر ${s.dangerCm} سم: توقف الروبوت.` });
    s.mode = 'blocked';
    return { state: s, events };
  }

  let l = 0, r = 0;
  if (want === 'forward') { l = 1; r = 1; }
  else if (want === 'backward') { l = -1; r = -1; }
  else if (want === 'left') { l = -0.5; r = 0.5; }
  else if (want === 'right') { l = 0.5; r = -0.5; }
  s.motorL = l; s.motorR = r;
  s.mode = want === 'stop' ? 'idle' : 'manual';
  const v = ((l + r) / 2) * speed;
  // the robot's right-hand side is -x when it faces +z: a right turn (left wheel forward) lowers the heading
  s.heading += ((r - l) * speed / WHEEL_BASE) * dt;
  let nx = s.x + Math.sin(s.heading) * v * dt;
  let nz = s.z + Math.cos(s.heading) * v * dt;
  // floor limits
  nx = Math.max(-FLOOR.halfX + ROBOT_RADIUS, Math.min(FLOOR.halfX - ROBOT_RADIUS, nx));
  nz = Math.max(-FLOOR.halfZ + ROBOT_RADIUS, Math.min(FLOOR.halfZ - ROBOT_RADIUS, nz));
  // body collision with obstacles: refuse to move into them (reversing out is allowed)
  const hit = s.obstacles.some((b) => Math.abs(nx - b.x) < b.w / 2 + ROBOT_RADIUS && Math.abs(nz - b.z) < b.d / 2 + ROBOT_RADIUS);
  if (!hit) { s.x = nx; s.z = nz; }
  else { s.motorL = 0; s.motorR = 0; }
  s.distance = senseDistance(s);
  return { state: s, events };
}

/** safe stopped state: no motion, no commands, motors at zero */
export function haltRobot(s: RobotState): RobotState {
  return { ...s, cmd: 'stop', patrol: false, avoidTurn: 0, mode: 'idle', motorL: 0, motorR: 0 };
}

import type { Vec3 } from '../types';

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: Vec3): Vec3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** rotate around the Y axis (counter-clockwise seen from +Y) */
export function rotY(v: Vec3, a: number): Vec3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
}

export interface Camera {
  yaw: number;
  pitch: number;
  dist: number;
  target: Vec3;
}

export interface CamBasis {
  eye: Vec3;
  r: Vec3;
  u: Vec3;
  f: Vec3;
}

export function basisOf(cam: Camera): CamBasis {
  const cp = Math.cos(cam.pitch);
  const eye: Vec3 = [
    cam.target[0] + cam.dist * cp * Math.sin(cam.yaw),
    cam.target[1] + cam.dist * Math.sin(cam.pitch),
    cam.target[2] + cam.dist * cp * Math.cos(cam.yaw),
  ];
  const f = norm(sub(cam.target, eye));
  const r = norm(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  return { eye, r, u, f };
}

export function projectPoint(p: Vec3, b: CamBasis, w: number, h: number): { x: number; y: number; z: number } {
  const d = sub(p, b.eye);
  const x = dot(d, b.r);
  const y = dot(d, b.u);
  const z = dot(d, b.f);
  const focal = Math.min(w, h) * 1.15;
  const zz = Math.max(z, 0.01);
  return { x: w / 2 + (x / zz) * focal, y: h / 2 - (y / zz) * focal, z };
}

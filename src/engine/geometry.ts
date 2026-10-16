import type { RGB, Shape, Vec3 } from '../types';
import { add, mul, rotY } from './math';

export interface Face {
  pts: Vec3[];
  color: RGB;
  owner: string;
  center: Vec3;
  twoSided?: boolean;
  layer: number;
  alpha?: number;
}

export interface Xform {
  pos: Vec3;
  rotY: number;
  scale: number;
}

const apply = (v: Vec3, x: Xform): Vec3 => add(x.pos, rotY(mul(v, x.scale), x.rotY));

function boxFaces(size: Vec3, off: Vec3, rot: number): Vec3[][] {
  const [w, h, d] = [size[0] / 2, size[1] / 2, size[2] / 2];
  const c = (sx: number, sy: number, sz: number): Vec3 => add(off, rotY([sx * w, sy * h, sz * d], rot));
  return [
    [c(-1, 1, -1), c(1, 1, -1), c(1, 1, 1), c(-1, 1, 1)], // top
    [c(-1, -1, 1), c(1, -1, 1), c(1, -1, -1), c(-1, -1, -1)], // bottom
    [c(-1, -1, 1), c(-1, 1, 1), c(1, 1, 1), c(1, -1, 1)], // front +z
    [c(1, -1, -1), c(1, 1, -1), c(-1, 1, -1), c(-1, -1, -1)], // back
    [c(1, -1, 1), c(1, 1, 1), c(1, 1, -1), c(1, -1, -1)], // +x
    [c(-1, -1, -1), c(-1, 1, -1), c(-1, 1, 1), c(-1, -1, 1)], // -x
  ];
}

function cylFaces(r: number, h: number, axis: 'x' | 'y' | 'z', off: Vec3, seg: number): Vec3[][] {
  // map (a, b, t): a,b = circle plane coords, t = along axis
  const m = (a: number, b: number, t: number): Vec3 => {
    const v: Vec3 = axis === 'y' ? [a, t, b] : axis === 'x' ? [t, a, b] : [a, b, t];
    return add(off, v);
  };
  const ring = (t: number) => Array.from({ length: seg }, (_, i) => {
    const ang = (i / seg) * Math.PI * 2;
    return m(Math.cos(ang) * r, Math.sin(ang) * r, t);
  });
  const lo = ring(-h / 2);
  const hi = ring(h / 2);
  const faces: Vec3[][] = [hi.slice(), lo.slice().reverse()];
  for (let i = 0; i < seg; i++) {
    const j = (i + 1) % seg;
    faces.push([lo[i], lo[j], hi[j], hi[i]]);
  }
  return faces;
}

/** Build world-space faces for one model instance. */
export function buildFaces(shapes: Shape[], owner: string, x: Xform, layer = 1): Face[] {
  const out: Face[] = [];
  for (const s of shapes) {
    const center = apply(s.offset, x);
    const local =
      s.type === 'box'
        ? boxFaces(s.size, s.offset, s.rotY ?? 0)
        : cylFaces(s.r, s.h, s.axis, s.offset, s.seg ?? 14);
    for (const poly of local) {
      out.push({ pts: poly.map((p) => apply(p, x)), color: s.color, owner, center, layer });
    }
  }
  return out;
}

/** A flat, two-sided polygon (floors, sensor cones, markers). */
export function flatPoly(pts: Vec3[], color: RGB, owner: string, alpha = 1, layer = 0): Face {
  return { pts, color, owner, center: pts[0], twoSided: true, layer, alpha };
}

export function transformPoint(v: Vec3, x: Xform): Vec3 {
  return apply(v, x);
}

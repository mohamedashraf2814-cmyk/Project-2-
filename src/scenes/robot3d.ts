import type { Vec3 } from '../types';
import { INSTANCES } from '../data/instances';
import { partById } from '../data/parts';
import { buildFaces, flatPoly, type Face, type Xform } from '../engine/geometry';
import { add, rotY as rotVec } from '../engine/math';
import type { Label3D, SceneData } from '../engine/render';
import { FLOOR, SENSOR_HALF_ANGLE, SENSOR_OFFSET, type RobotState } from '../simulation/robot';
import { modelOf } from './models';

const arc = (cx: number, cz: number, h: number, r: number, half: number, y: number, n = 14): Vec3[] => {
  const pts: Vec3[] = [[cx, y, cz]];
  for (let i = 0; i <= n; i++) {
    const a = h - half + (2 * half * i) / n;
    pts.push([cx + Math.sin(a) * r, y, cz + Math.cos(a) * r]);
  }
  return pts;
};

export function robotWorldFaces(x: number, z: number, heading: number, owner = 'robot'): Face[] {
  const faces: Face[] = [];
  for (const inst of INSTANCES.filter((i) => i.group === 'robot')) {
    const m = modelOf(partById(inst.part)!.model);
    const local = rotVec(inst.home, heading);
    const xf: Xform = { pos: add([x, 0, z], local), rotY: heading + (inst.rotY ?? 0), scale: 1 };
    faces.push(...buildFaces(m.shapes, owner, xf));
  }
  return faces;
}

export function buildRobotScene(r: RobotState, showCone: boolean): SceneData {
  const faces: Face[] = [
    flatPoly([[-FLOOR.halfX, 0, -FLOOR.halfZ], [FLOOR.halfX, 0, -FLOOR.halfZ], [FLOOR.halfX, 0, FLOOR.halfZ], [-FLOOR.halfX, 0, FLOOR.halfZ]], [28, 44, 70], 'floor', 1, 0),
  ];
  // low walls
  const wall = (x: number, z: number, w: number, d: number) => {
    faces.push(...buildFaces([{ type: 'box', size: [w, 8, d], offset: [0, 4, 0], color: [60, 80, 118] }], 'wall', { pos: [x, 0, z], rotY: 0, scale: 1 }));
  };
  wall(0, FLOOR.halfZ + 3, FLOOR.halfX * 2 + 12, 6);
  wall(0, -FLOOR.halfZ - 3, FLOOR.halfX * 2 + 12, 6);
  wall(FLOOR.halfX + 3, 0, 6, FLOOR.halfZ * 2);
  wall(-FLOOR.halfX - 3, 0, 6, FLOOR.halfZ * 2);

  const labels: Label3D[] = [];
  if (showCone) {
    const sx = r.x + Math.sin(r.heading) * SENSOR_OFFSET;
    const sz = r.z + Math.cos(r.heading) * SENSOR_OFFSET;
    const danger = r.distance <= r.dangerCm;
    // danger zone (conceptual) and the actual sensor beam up to the measured distance
    faces.push(flatPoly(arc(sx, sz, r.heading, r.dangerCm, Math.PI / 5, 0.2), danger ? [255, 80, 80] : [255, 190, 60], 'zone', 0.22, 0));
    faces.push(flatPoly(arc(sx, sz, r.heading, Math.min(r.distance, 160), SENSOR_HALF_ANGLE, 0.35), [0, 217, 255], 'beam', 0.5, 0));
    const ex = sx + Math.sin(r.heading) * Math.min(r.distance, 160);
    const ez = sz + Math.cos(r.heading) * Math.min(r.distance, 160);
    labels.push({ pos: [ex, 14, ez], text: `${r.distance.toFixed(0)} سم (محاكاة)`, color: danger ? '#FFB4B4' : '#00D9FF' });
  }
  for (const o of r.obstacles) {
    faces.push(...buildFaces([{ type: 'box', size: [o.w, 24, o.d], offset: [0, 12, 0], color: [232, 120, 40] }], `obs${o.id}`, { pos: [o.x, 0, o.z], rotY: 0, scale: 1 }));
    labels.push({ pos: [o.x, 30, o.z], text: 'عائق', color: '#FFD9B0' });
  }
  faces.push(...robotWorldFaces(r.x, r.z, r.heading));
  return { faces, lines: [], pins: [], labels, highlight: new Set(), grid: { size: 140, step: 20, y: 0.05, color: 'rgba(0,217,255,0.07)' } };
}

/** tiny preview scene for the component library */
export function buildPartScene(partModelKey: string, scale = 1): SceneData {
  const m = modelOf(partModelKey);
  const faces = buildFaces(m.shapes, 'part', { pos: [0, 0, 0], rotY: 0, scale });
  return { faces, lines: [], pins: [], labels: [], highlight: new Set(), background: ['#0B1B36', '#07101F'] };
}

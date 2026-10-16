import type { SceneInstance, Vec3, WireDef, PinMap } from '../types';
import { INSTANCES } from '../data/instances';
import { STEPS } from '../data/steps';
import { WIRES, KIND_COLORS } from '../data/wires';
import { partById } from '../data/parts';
import { buildFaces, flatPoly, type Face, type Xform } from '../engine/geometry';
import { clamp, easeInOut, lerp, lerp3 } from '../engine/math';
import type { Line3D, PinMark, SceneData, Label3D } from '../engine/render';
import { modelOf } from './models';
import { pinWorld, resolveEndpoint, wirePath, wireSafety } from '../wiring/resolve';

export const WEARABLE_OFFSET: Vec3 = [46, 0, -6];
const instById = new Map(INSTANCES.map((i) => [i.id, i]));

export function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

const modelFor = (inst: SceneInstance) => modelOf(partById(inst.part)!.model);

export interface Placement {
  pos: Vec3;
  rot: number;
  visible: boolean;
}

/** Where an instance is, for assembly stage `step` at animation progress `t` (0..1). */
export function placement(inst: SceneInstance, step: number, t: number): Placement {
  const home = inst.home;
  const rot = inst.rotY ?? 0;
  const view = STEPS[step - 1].view;
  if (inst.group === 'wearable') {
    if (view === 'robot') return { pos: home, rot, visible: false };
    if (inst.stage < step) return { pos: home, rot, visible: true };
  } else if (view === 'wearable') {
    return { pos: home, rot, visible: false };
  }
  if (inst.stage < step) return { pos: home, rot, visible: true };
  const bench = inst.bench;
  const brot = inst.benchRot ?? 0;
  if (inst.stage > step) return { pos: bench, rot: brot, visible: true };
  // current stage: staggered install animation within t ∈ [0, 0.7]
  const installs = STEPS[step - 1].installs;
  const i = installs.indexOf(inst.id);
  const n = Math.max(1, installs.length);
  const u = easeInOut(clamp((t / 0.7) * n - (i < 0 ? 0 : i), 0, 1));
  const start: Vec3 = inst.from ? [home[0] + inst.from[0], home[1] + inst.from[1], home[2] + inst.from[2]] : bench;
  const pos = lerp3(start, home, u);
  pos[1] += Math.sin(Math.PI * u) * (inst.from ? 0 : 9);
  return { pos, rot: lerp(inst.from ? rot : brot, rot, u), visible: true };
}

export function effectiveStage(w: WireDef): number {
  return Math.max(w.stage, instById.get(w.from.part)?.stage ?? 0, instById.get(w.to.part)?.stage ?? 0);
}

const FLOOR_COLOR: [number, number, number] = [16, 30, 54];

function tableFaces(): Face[] {
  const y = 0;
  return [flatPoly([[-70, y, -62], [70, y, -62], [70, y, 40], [-70, y, 40]], FLOOR_COLOR, 'floor', 1, 0), flatPoly([[-16, y + 0.02, -14], [16, y + 0.02, -14], [16, y + 0.02, 14], [-16, y + 0.02, 14]], [22, 44, 78], 'floor', 1, 0)];
}

export interface LabOpts {
  step: number;
  t: number;
  selected: string | null;
  map: PinMap;
  focus: boolean;
}

export function buildLabScene(o: LabOpts): SceneData {
  const faces: Face[] = tableFaces();
  const lines: Line3D[] = [];
  const pins: PinMark[] = [];
  const labels: Label3D[] = [];
  const step = STEPS[o.step - 1];
  const view = step.view;
  const hl = new Set<string>(step.highlight);
  if (o.selected) hl.add(o.selected);
  const offsetFor = (inst: SceneInstance): Vec3 => (inst.group === 'wearable' && view === 'both' ? WEARABLE_OFFSET : [0, 0, 0]);

  const pos = new Map<string, Placement>();
  for (const inst of INSTANCES) {
    const p = placement(inst, o.step, o.t);
    if (!p.visible) continue;
    const off = offsetFor(inst);
    const at: Vec3 = [p.pos[0] + off[0], p.pos[1] + off[1], p.pos[2] + off[2]];
    pos.set(inst.id, { ...p, pos: at });
    const xf: Xform = { pos: at, rotY: p.rot, scale: 1 };
    faces.push(...buildFaces(modelFor(inst).shapes, inst.id, xf));
    if (hl.has(inst.id)) {
      const m = modelFor(inst);
      labels.push({ pos: [at[0], at[1] + m.size[1] + 4, at[2]], text: inst.label, color: '#00D9FF' });
    }
  }

  // wires (drawn between installed parts at their final positions)
  const idx = new Map<string, number>();
  WIRES.forEach((w, i) => idx.set(w.id, i));
  for (const w of WIRES) {
    const es = effectiveStage(w);
    if (es > o.step) continue;
    const a = instById.get(w.from.part)!;
    const b = instById.get(w.to.part)!;
    if (a.group === 'wearable' && view === 'robot') continue;
    if (a.group === 'robot' && view === 'wearable') continue;
    const offA = offsetFor(a);
    const ra = resolveEndpoint(w.from, o.map);
    const rb = resolveEndpoint(w.to, o.map);
    const pa = pinWorld(a.id, ra.pin, 'home', offA);
    const pb = pinWorld(b.id, rb.pin, 'home', offA);
    if (!pa || !pb) continue;
    const safe = wireSafety(w, o.map).safe;
    const prog = es < o.step ? 1 : clamp((o.t - 0.7) / 0.3, 0, 1);
    if (prog <= 0) continue;
    lines.push({
      pts: wirePath(pa, pb, 3 + ((idx.get(w.id) ?? 0) % 7) * 0.9),
      color: safe ? hexA(KIND_COLORS[w.kind], 0.95) : '#FF3B3B',
      width: 1.8,
      progress: prog,
      dash: safe ? undefined : [5, 4],
    });
  }

  // pins of the selected part
  if (o.selected) {
    const inst = instById.get(o.selected);
    const p = pos.get(o.selected);
    if (inst && p) {
      const m = modelFor(inst);
      const sc = 1;
      for (const pin of m.pins) {
        const v = pinWorld(inst.id, pin.id, 'home', offsetFor(inst));
        if (!v) continue;
        // position relative to current (animated) placement
        const dx = p.pos[0] - (inst.home[0] + offsetFor(inst)[0]);
        const dy = p.pos[1] - (inst.home[1] + offsetFor(inst)[1]);
        const dz = p.pos[2] - (inst.home[2] + offsetFor(inst)[2]);
        pins.push({ id: `${inst.id}.${pin.id}`, pos: [v[0] + dx * sc, v[1] + dy, v[2] + dz], color: '#FFD166', r: 0.18, label: pin.label });
      }
    }
  }

  return {
    faces,
    lines,
    pins,
    labels,
    highlight: hl,
    dim: o.focus && hl.size > 0 && o.step > 1,
    grid: { size: 60, step: 10, y: 0.03, color: 'rgba(0,217,255,0.07)' },
  };
}

export interface WireOpts {
  group: 'robot' | 'wearable';
  map: PinMap;
  selectedId: string | null;
  progress: number; // 0..1 for the selected wire
  verified: ReadonlySet<string>;
  chosen: { part: string; pin: string } | null;
  showAll: boolean;
}

export function buildWireScene(o: WireOpts): SceneData {
  const faces: Face[] = [flatPoly([[-60, 0, -42], [60, 0, -42], [60, 0, 40], [-60, 0, 40]], [10, 24, 46], 'floor', 1, 0)];
  const lines: Line3D[] = [];
  const pins: PinMark[] = [];
  const labels: Label3D[] = [];
  const insts = INSTANCES.filter((i) => i.group === o.group);
  const sel = o.selectedId ? WIRES.find((w) => w.id === o.selectedId) ?? null : null;
  const hl = new Set<string>();
  if (sel) {
    hl.add(sel.from.part);
    hl.add(sel.to.part);
  }

  for (const inst of insts) {
    if (inst.id === 'chassis' || inst.id === 'caster' || inst.id.startsWith('wheel') || inst.id === 'bb') continue;
    const xf: Xform = { pos: inst.wire, rotY: inst.wireRotY ?? 0, scale: 2.2 };
    faces.push(...buildFaces(modelFor(inst).shapes, inst.id, xf));
    const m = modelFor(inst);
    labels.push({ pos: [inst.wire[0], inst.wire[1] + (m.size[1] + 1) * 2.2 + 3, inst.wire[2]], text: inst.label, color: hl.has(inst.id) ? '#00D9FF' : '#8FA3C0' });
    for (const pin of m.pins) {
      const v = pinWorld(inst.id, pin.id, 'wire');
      if (!v) continue;
      const isChosen = o.chosen && o.chosen.part === inst.id && o.chosen.pin === pin.id;
      pins.push({ id: `${inst.id}.${pin.id}`, pos: v, color: isChosen ? '#8BEA16' : '#C9A24B', r: 0.16 * 2.2 / 2.2, ring: !!isChosen });
    }
  }

  const wires = WIRES.filter((w) => w.group === o.group);
  wires.forEach((w, i) => {
    const ra = resolveEndpoint(w.from, o.map);
    const rb = resolveEndpoint(w.to, o.map);
    const pa = pinWorld(w.from.part, ra.pin, 'wire');
    const pb = pinWorld(w.to.part, rb.pin, 'wire');
    if (!pa || !pb) return;
    const isSel = sel?.id === w.id;
    const safe = wireSafety(w, o.map).safe;
    if (isSel) return;
    if (!o.showAll && !o.verified.has(w.id)) return;
    lines.push({ pts: wirePath(pa, pb, 5 + (i % 9) * 1.4), color: o.verified.has(w.id) ? hexA(KIND_COLORS[w.kind], 0.55) : hexA(KIND_COLORS[w.kind], 0.28), width: 1.2, dash: safe ? undefined : [4, 4] });
  });

  if (sel) {
    const ra = resolveEndpoint(sel.from, o.map);
    const rb = resolveEndpoint(sel.to, o.map);
    const pa = pinWorld(sel.from.part, ra.pin, 'wire');
    const pb = pinWorld(sel.to.part, rb.pin, 'wire');
    const safe = wireSafety(sel, o.map).safe;
    if (pa && pb) {
      lines.push({ pts: wirePath(pa, pb, 12), color: safe ? KIND_COLORS[sel.kind] : '#FF3B3B', width: 3.4, progress: safe ? o.progress : 1, glow: true, dash: safe ? undefined : [6, 5] });
      pins.push({ id: 'src', pos: pa, color: '#00D9FF', r: 0.5, ring: true, label: `المصدر: ${ra.label}` });
      if (safe || o.chosen) pins.push({ id: 'dst', pos: pb, color: o.progress >= 1 && safe ? '#00D9FF' : '#5B6B85', r: 0.5, ring: o.progress >= 1, label: o.progress >= 1 && safe ? `الوجهة: ${rb.label}` : undefined });
    }
  }
  return { faces, lines, pins, labels, highlight: hl, grid: { size: 56, step: 8, y: 0.03, color: 'rgba(0,217,255,0.06)' }, background: ['#0A1A34', '#050B18'] };
}

import type { RGB, Vec3 } from '../types';
import type { Face } from './geometry';
import { basisOf, cross, dot, norm, projectPoint, sub, type Camera } from './math';

export interface Line3D {
  pts: Vec3[];
  color: string;
  width: number;
  dash?: number[];
  /** draw only the first part of the polyline: 0..1 */
  progress?: number;
  glow?: boolean;
}

export interface PinMark {
  id: string;
  pos: Vec3;
  color: string;
  r: number;
  label?: string;
  ring?: boolean;
}

export interface Label3D {
  pos: Vec3;
  text: string;
  color?: string;
  bg?: string;
  size?: number;
}

export interface SceneData {
  faces: Face[];
  lines: Line3D[];
  pins: PinMark[];
  labels: Label3D[];
  /** owners drawn with a highlight outline */
  highlight: ReadonlySet<string>;
  /** if set, non-highlighted opaque objects are dimmed */
  dim?: boolean;
  grid?: { size: number; step: number; y: number; color: string };
  background?: [string, string];
}

export interface HitMap {
  polys: { pts: [number, number][]; owner: string }[];
  pins: { id: string; x: number; y: number; r: number }[];
}

const LIGHT = norm([-0.45, 0.85, 0.35]);

const shade = (c: RGB, k: number): string =>
  `rgb(${Math.min(255, Math.round(c[0] * k))},${Math.min(255, Math.round(c[1] * k))},${Math.min(255, Math.round(c[2] * k))})`;

function centroid(pts: Vec3[]): Vec3 {
  const s: Vec3 = [0, 0, 0];
  for (const p of pts) {
    s[0] += p[0];
    s[1] += p[1];
    s[2] += p[2];
  }
  return [s[0] / pts.length, s[1] / pts.length, s[2] / pts.length];
}

export function renderScene(ctx: CanvasRenderingContext2D, w: number, h: number, cam: Camera, scene: SceneData): HitMap {
  const b = basisOf(cam);
  const hits: HitMap = { polys: [], pins: [] };

  // background
  const bg = scene.background ?? ['#0B1B36', '#050B18'];
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, bg[0]);
  grad.addColorStop(1, bg[1]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // grid
  if (scene.grid) {
    const { size, step, y, color } = scene.grid;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = -size; i <= size + 0.001; i += step) {
      const a = projectPoint([i, y, -size], b, w, h);
      const c = projectPoint([i, y, size], b, w, h);
      if (a.z > 0.5 && c.z > 0.5) {
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(c.x, c.y);
      }
      const d = projectPoint([-size, y, i], b, w, h);
      const e = projectPoint([size, y, i], b, w, h);
      if (d.z > 0.5 && e.z > 0.5) {
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(e.x, e.y);
      }
    }
    ctx.stroke();
  }

  // faces: layer then far-to-near
  type Item = { f: Face; d: number; n: Vec3 | null; ok: boolean };
  const items: Item[] = [];
  for (const f of scene.faces) {
    const c = centroid(f.pts);
    const d = Math.hypot(c[0] - b.eye[0], c[1] - b.eye[1], c[2] - b.eye[2]);
    let n: Vec3 | null = null;
    let ok = true;
    if (!f.twoSided) {
      n = norm(cross(sub(f.pts[1], f.pts[0]), sub(f.pts[2], f.pts[0])));
      if (dot(n, sub(c, f.center)) < 0) n = [-n[0], -n[1], -n[2]];
      ok = dot(n, sub(b.eye, c)) > 0;
    }
    if (ok) items.push({ f, d, n, ok });
  }
  items.sort((p, q) => p.f.layer - q.f.layer || q.d - p.d);

  const hl = scene.highlight;
  const outlines: [number, number][][] = [];
  for (const it of items) {
    const proj = it.f.pts.map((p) => projectPoint(p, b, w, h));
    if (proj.some((p) => p.z < 0.5)) continue;
    const isHl = hl.has(it.f.owner);
    const k = it.n ? 0.5 + 0.55 * Math.max(0, dot(it.n, LIGHT)) : 1;
    ctx.beginPath();
    proj.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    const dimmed = scene.dim && !isHl && !it.f.twoSided && it.f.owner !== 'chassis';
    ctx.globalAlpha = (it.f.alpha ?? 1) * (dimmed ? 0.35 : 1);
    ctx.fillStyle = shade(it.f.color, isHl ? Math.min(1.5, k * 1.25) : k);
    ctx.fill();
    ctx.globalAlpha = Math.min(1, (it.f.alpha ?? 1) * (dimmed ? 0.35 : 1));
    if (!it.f.twoSided) {
      ctx.strokeStyle = 'rgba(0,0,0,0.28)';
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (isHl && !it.f.twoSided) outlines.push(proj.map((p) => [p.x, p.y] as [number, number]));
    if (!it.f.twoSided || it.f.owner.length) hits.polys.push({ pts: proj.map((p) => [p.x, p.y] as [number, number]), owner: it.f.owner });
  }
  if (outlines.length) {
    ctx.save();
    ctx.strokeStyle = '#00D9FF';
    ctx.lineWidth = 1.6;
    ctx.shadowColor = '#00D9FF';
    ctx.shadowBlur = 10;
    for (const o of outlines) {
      ctx.beginPath();
      o.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
  }

  // wires (always on top)
  for (const l of scene.lines) {
    const pr = l.pts.map((p) => projectPoint(p, b, w, h));
    if (pr.length < 2 || pr.some((p) => p.z < 0.5)) continue;
    const prog = l.progress ?? 1;
    // cumulative lengths in screen space (good enough for animating)
    const segLen: number[] = [];
    let total = 0;
    for (let i = 1; i < pr.length; i++) {
      const d = Math.hypot(pr[i].x - pr[i - 1].x, pr[i].y - pr[i - 1].y);
      segLen.push(d);
      total += d;
    }
    let remain = total * prog;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = l.color;
    ctx.lineWidth = l.width;
    if (l.dash) ctx.setLineDash(l.dash);
    if (l.glow) {
      ctx.shadowColor = l.color;
      ctx.shadowBlur = 8;
    }
    ctx.beginPath();
    ctx.moveTo(pr[0].x, pr[0].y);
    for (let i = 1; i < pr.length && remain > 0; i++) {
      const sl = segLen[i - 1];
      if (remain >= sl) {
        ctx.lineTo(pr[i].x, pr[i].y);
        remain -= sl;
      } else {
        const t = sl ? remain / sl : 0;
        ctx.lineTo(pr[i - 1].x + (pr[i].x - pr[i - 1].x) * t, pr[i - 1].y + (pr[i].y - pr[i - 1].y) * t);
        remain = 0;
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  // pins
  for (const p of scene.pins) {
    const q = projectPoint(p.pos, b, w, h);
    if (q.z < 0.5) continue;
    const focal = Math.min(w, h) * 1.15;
    const r = Math.max(2.2, (p.r / q.z) * focal);
    ctx.beginPath();
    ctx.arc(q.x, q.y, r, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
    if (p.ring) {
      ctx.beginPath();
      ctx.arc(q.x, q.y, r + 3.5, 0, Math.PI * 2);
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    hits.pins.push({ id: p.id, x: q.x, y: q.y, r: Math.max(r + 4, 9) });
    if (p.label) drawLabel(ctx, q.x, q.y - r - 9, p.label, '#E8EDF3', 'rgba(5,11,24,0.85)', 11);
  }

  // labels
  for (const l of scene.labels) {
    const q = projectPoint(l.pos, b, w, h);
    if (q.z < 0.5) continue;
    drawLabel(ctx, q.x, q.y, l.text, l.color ?? '#E8EDF3', l.bg ?? 'rgba(5,11,24,0.78)', l.size ?? 12);
  }
  return hits;
}

function drawLabel(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, fg: string, bg: string, size: number) {
  ctx.save();
  ctx.font = `600 ${size}px "IBM Plex Sans Arabic", "JetBrains Mono", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const tw = ctx.measureText(text).width;
  ctx.fillStyle = bg;
  const pad = 5;
  ctx.beginPath();
  ctx.roundRect?.(x - tw / 2 - pad, y - size / 2 - 3, tw + pad * 2, size + 6, 6);
  if (!ctx.roundRect) ctx.rect(x - tw / 2 - pad, y - size / 2 - 3, tw + pad * 2, size + 6);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function inPoly(x: number, y: number, pts: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pick(hits: HitMap, x: number, y: number): { pin?: string; owner?: string } {
  for (const p of hits.pins) {
    if (Math.hypot(p.x - x, p.y - y) <= p.r) return { pin: p.id };
  }
  for (let i = hits.polys.length - 1; i >= 0; i--) {
    if (inPoly(x, y, hits.polys[i].pts)) return { owner: hits.polys[i].owner };
  }
  return {};
}

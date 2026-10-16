import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Maximize2, Minus, Plus, RotateCcw, Rotate3d } from 'lucide-react';
import { clamp, type Camera } from './math';
import { pick, renderScene, type HitMap, type SceneData } from './render';

export interface ViewSpec {
  yaw: number;
  pitch: number;
  dist: number;
  target: [number, number, number];
}

interface Props {
  scene: SceneData;
  view: ViewSpec;
  /** changing this resets the camera to `view` */
  viewKey?: string;
  autoRotate?: boolean;
  onPick?: (owner: string | null) => void;
  onPinPick?: (pinId: string) => void;
  label: string;
  height?: number | string;
  compact?: boolean;
  className?: string;
}

function hasCanvas(): boolean {
  try {
    return !!document.createElement('canvas').getContext('2d');
  } catch {
    return false;
  }
}

export function Viewport({ scene, view, viewKey, autoRotate, onPick, onPinPick, label, height = '100%', compact, className }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const cam = useRef<Camera>({ ...view });
  const hits = useRef<HitMap>({ polys: [], pins: [] });
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const size = useRef({ w: 300, h: 200, dpr: 1 });
  const [spin, setSpin] = useState(!!autoRotate);
  const [supported] = useState(hasCanvas);
  const frame = useRef(0);

  const draw = useCallback(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const { w, h, dpr } = size.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    hits.current = renderScene(ctx, w, h, cam.current, sceneRef.current);
  }, []);

  const schedule = useCallback(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      draw();
    });
  }, [draw]);

  // reset camera when the view key changes
  useEffect(() => {
    cam.current = { yaw: view.yaw, pitch: view.pitch, dist: view.dist, target: [...view.target] as [number, number, number] };
    schedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey]);

  // redraw when the scene changes
  useLayoutEffect(() => {
    draw();
  }, [scene, draw]);

  // resize
  useEffect(() => {
    const el = wrap.current;
    const c = canvas.current;
    if (!el || !c) return;
    const resize = () => {
      const r = el.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      size.current = { w: Math.max(120, r.width), h: Math.max(120, r.height), dpr };
      c.width = Math.round(size.current.w * dpr);
      c.height = Math.round(size.current.h * dpr);
      c.style.width = `${size.current.w}px`;
      c.style.height = `${size.current.h}px`;
      draw();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [draw]);

  // slow auto-rotation (render loop exists only while enabled)
  useEffect(() => {
    if (!spin) return;
    let raf = 0;
    let last = performance.now();
    const tick = (t: number) => {
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;
      cam.current.yaw += dt * 0.35;
      draw();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [spin, draw]);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  // pointer / wheel / touch
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const pointers = new Map<number, { x: number; y: number }>();
    let moved = 0;
    let startX = 0;
    let startY = 0;
    let pinch = 0;
    let panMode = false;

    const rel = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const down = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      const p = rel(e);
      pointers.set(e.pointerId, p);
      if (pointers.size === 1) {
        moved = 0;
        startX = p.x;
        startY = p.y;
        panMode = e.button === 2 || e.shiftKey;
      }
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
    };
    const move = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const p = rel(e);
      pointers.set(e.pointerId, p);
      const dx = p.x - prev.x;
      const dy = p.y - prev.y;
      moved += Math.abs(dx) + Math.abs(dy);
      const c = cam.current;
      if (pointers.size === 1) {
        if (panMode) {
          panBy(dx, dy);
        } else {
          c.yaw -= dx * 0.008;
          c.pitch = clamp(c.pitch + dy * 0.006, 0.08, 1.45);
        }
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch > 0) c.dist = clamp(c.dist * (pinch / d), 8, 600);
        pinch = d;
      }
      schedule();
    };
    const up = (e: PointerEvent) => {
      const had = pointers.delete(e.pointerId);
      if (!had) return;
      if (pointers.size === 0 && moved < 5) {
        const r = pick(hits.current, startX, startY);
        if (r.pin) onPinPick?.(r.pin);
        else onPick?.(r.owner && r.owner !== 'floor' ? r.owner : null);
      }
    };
    const panBy = (dx: number, dy: number) => {
      const c = cam.current;
      const k = c.dist * 0.0016;
      const cy = Math.cos(c.yaw);
      const sy = Math.sin(c.yaw);
      c.target[0] += (-dx * cy) * k;
      c.target[2] += (dx * sy) * k;
      c.target[1] = clamp(c.target[1] + dy * k, -20, 40);
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      cam.current.dist = clamp(cam.current.dist * (e.deltaY > 0 ? 1.1 : 0.9), 8, 600);
      schedule();
    };
    const ctx = (e: Event) => e.preventDefault();
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('contextmenu', ctx);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('contextmenu', ctx);
    };
  }, [onPick, onPinPick, schedule]);

  const zoom = (f: number) => {
    cam.current.dist = clamp(cam.current.dist * f, 8, 600);
    schedule();
  };
  const reset = () => {
    cam.current = { yaw: view.yaw, pitch: view.pitch, dist: view.dist, target: [...view.target] as [number, number, number] };
    schedule();
  };
  const onKey = (e: React.KeyboardEvent) => {
    const c = cam.current;
    let handled = true;
    if (e.key === 'ArrowLeft') c.yaw += 0.12;
    else if (e.key === 'ArrowRight') c.yaw -= 0.12;
    else if (e.key === 'ArrowUp') c.pitch = clamp(c.pitch + 0.08, 0.08, 1.45);
    else if (e.key === 'ArrowDown') c.pitch = clamp(c.pitch - 0.08, 0.08, 1.45);
    else if (e.key === '+' || e.key === '=') c.dist = clamp(c.dist * 0.9, 8, 600);
    else if (e.key === '-') c.dist = clamp(c.dist * 1.1, 8, 600);
    else if (e.key === '0') reset();
    else handled = false;
    if (handled) {
      e.preventDefault();
      schedule();
    }
  };

  if (!supported) {
    return (
      <div className={`viewport fallback ${className ?? ''}`} style={{ height }} role="img" aria-label={label}>
        <p>تعذّر تشغيل العرض ثلاثي الأبعاد في هذا المتصفح. استخدم الجداول والقوائم لمتابعة الخطوات.</p>
      </div>
    );
  }

  return (
    <div ref={wrap} className={`viewport ${className ?? ''}`} style={{ height }} tabIndex={0} onKeyDown={onKey} role="application" aria-label={`${label} — اسحب للتدوير، عجلة الفأرة للتكبير، Shift مع السحب للتحريك، الأسهم للتدوير`}>
      <canvas ref={canvas} data-testid="viewport-canvas" />
      <div className={`vp-controls ${compact ? 'compact' : ''}`} dir="ltr">
        <button type="button" onClick={() => zoom(0.85)} title="تكبير" aria-label="تكبير">
          <Plus size={16} />
        </button>
        <button type="button" onClick={() => zoom(1.18)} title="تصغير" aria-label="تصغير">
          <Minus size={16} />
        </button>
        <button type="button" onClick={reset} title="إعادة ضبط الزاوية" aria-label="إعادة ضبط الزاوية">
          <RotateCcw size={16} />
        </button>
        <button type="button" onClick={() => setSpin((s) => !s)} aria-pressed={spin} title="دوران تلقائي" aria-label="دوران تلقائي" className={spin ? 'on' : ''}>
          <Rotate3d size={16} />
        </button>
        {!compact ? (
          <button type="button" onClick={() => (document.fullscreenElement ? document.exitFullscreen?.() : wrap.current?.requestFullscreen?.())} title="ملء الشاشة" aria-label="ملء الشاشة">
            <Maximize2 size={16} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

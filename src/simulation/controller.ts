export type AnimState = 'idle' | 'playing' | 'paused' | 'done';

export interface Scheduler {
  request: (cb: (t: number) => void) => number;
  cancel: (id: number) => void;
  now: () => number;
}

const browserScheduler: Scheduler = {
  request: (cb) => requestAnimationFrame(cb),
  cancel: (id) => cancelAnimationFrame(id),
  now: () => performance.now(),
};

/**
 * Reusable animation controller: play / pause / resume / stop / reset / replay + progress.
 * Exactly one frame callback is ever scheduled and it is cancelled on pause, stop, reset and dispose.
 */
export class AnimationController {
  progress = 0;
  state: AnimState = 'idle';
  speed = 1;
  private handle = 0;
  private last = 0;
  private listeners = new Set<() => void>();
  private snap = { progress: 0, state: 'idle' as AnimState };

  constructor(public durationMs: number, private sched: Scheduler = browserScheduler, private onDone?: () => void) {}

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.snap;
  private emit() {
    this.snap = { progress: this.progress, state: this.state };
    this.listeners.forEach((l) => l());
  }

  get hasFrame() {
    return this.handle !== 0;
  }

  private loop = (t: number) => {
    this.handle = 0;
    if (this.state !== 'playing') return;
    const dt = t - this.last;
    this.last = t;
    this.advance(dt);
    if (this.state === 'playing') this.handle = this.sched.request(this.loop);
  };

  /** advance by dt milliseconds (also used directly by tests) */
  advance(dtMs: number) {
    if (this.state !== 'playing') return;
    this.progress = Math.min(1, this.progress + (dtMs * this.speed) / this.durationMs);
    if (this.progress >= 1) {
      this.state = 'done';
      this.emit();
      this.onDone?.();
      return;
    }
    this.emit();
  }

  private startFrames() {
    if (this.handle) this.sched.cancel(this.handle);
    this.last = this.sched.now();
    this.handle = this.sched.request(this.loop);
  }

  play() {
    if (this.state === 'done') this.progress = 0;
    if (this.state === 'playing') return;
    this.state = 'playing';
    this.emit();
    this.startFrames();
  }
  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.cancelFrame();
    this.emit();
  }
  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.emit();
    this.startFrames();
  }
  stop() {
    this.cancelFrame();
    this.state = 'idle';
    this.progress = 0;
    this.emit();
  }
  reset() {
    this.stop();
  }
  replay() {
    this.cancelFrame();
    this.progress = 0;
    this.state = 'playing';
    this.emit();
    this.startFrames();
  }
  /** jump to the end without playing (used when a stage is already complete) */
  finish() {
    this.cancelFrame();
    this.progress = 1;
    this.state = 'done';
    this.emit();
  }
  setSpeed(s: number) {
    this.speed = Math.max(0.25, Math.min(3, s));
  }
  private cancelFrame() {
    if (this.handle) this.sched.cancel(this.handle);
    this.handle = 0;
  }
  dispose() {
    this.cancelFrame();
    this.listeners.clear();
  }
}

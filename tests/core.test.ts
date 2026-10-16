import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PINMAP, validatePinMap, gpioIssue, SIGNALS } from '../src/data/gpio';
import { WIRES } from '../src/data/wires';
import { INSTANCES } from '../src/data/instances';
import { STEPS } from '../src/data/steps';
import { PARTS } from '../src/data/parts';
import { MODELS } from '../src/scenes/models';
import { attemptVerify, pinExists, wireSafety, wireSignature } from '../src/wiring/resolve';
import { runChecks, groundConnected } from '../src/wiring/checks';
import { reduce, initialWizard, completionBlock, sanitize, type GateContext } from '../src/assembly/wizard';
import { AnimationController, type Scheduler } from '../src/simulation/controller';

test('every part references an existing model and every instance an existing part', () => {
  for (const p of PARTS) assert.ok(MODELS[p.model], `model ${p.model}`);
  for (const i of INSTANCES) assert.ok(PARTS.find((p) => p.id === i.part), `part ${i.part}`);
});

test('all structured wires reference existing pins with the default pin map', () => {
  const map = DEFAULT_PINMAP;
  for (const w of WIRES) {
    const s = wireSafety(w, map);
    assert.ok(s.safe, `${w.id}: ${s.reasons.join(' | ')}`);
  }
  assert.ok(WIRES.length >= 50);
});

test('default pin map is valid and avoids flash, strapping-fail and input-only outputs', () => {
  const r = validatePinMap(DEFAULT_PINMAP);
  assert.equal(r.hasFail, false);
  for (const s of SIGNALS) if (s.dir === 'out') assert.ok(![34, 35, 36, 39, 12, 6, 7, 8, 9, 10, 11].includes(DEFAULT_PINMAP[s.key]));
});

test('gpio rules: flash, input-only output, GPIO12 and duplicates are rejected', () => {
  const out = SIGNALS.find((s) => s.key === 'AIN1')!;
  assert.equal(gpioIssue(6, out).status, 'fail');
  assert.equal(gpioIssue(34, out).status, 'fail');
  assert.equal(gpioIssue(12, out).status, 'fail');
  assert.equal(gpioIssue(2, out).status, 'warn');
  assert.equal(gpioIssue(26, out).status, 'ok');
  const r = validatePinMap({ ...DEFAULT_PINMAP, AIN2: 26 });
  assert.equal(r.hasFail, true);
  assert.equal(r.duplicates.length, 1);
});

test('unsafe pin map makes the wire unsafe and it cannot be verified', () => {
  const bad = { ...DEFAULT_PINMAP, PWMA: 6 };
  const w = WIRES.find((x) => x.id === 'M3')!;
  assert.equal(wireSafety(w, bad).safe, false);
  const r = attemptVerify(w, bad, { part: 'drv', pin: 'PWMA' });
  assert.equal(r.ok, false);
});

test('verification requires the exact destination pin', () => {
  const w = WIRES.find((x) => x.id === 'M1')!;
  assert.equal(attemptVerify(w, DEFAULT_PINMAP, { part: 'drv', pin: 'AIN1' }).ok, true);
  const wrongPin = attemptVerify(w, DEFAULT_PINMAP, { part: 'drv', pin: 'AIN2' });
  assert.equal(wrongPin.ok, false);
  const wrongPart = attemptVerify(w, DEFAULT_PINMAP, { part: 'us', pin: 'TRIG' });
  assert.equal(wrongPart.ok, false);
  assert.ok(wireSignature(w, DEFAULT_PINMAP).includes('GPIO26'));
});

test('a direct ECHO to ESP32 wire is unsafe and the electrical check fails', () => {
  const direct = { id: 'X', from: { part: 'us', pin: 'ECHO' }, to: { part: 'esp', pin: '@ECHO' }, kind: 'digital', purpose: '', instruction: '', group: 'robot', stage: 6 } as const;
  assert.equal(wireSafety(direct, DEFAULT_PINMAP).safe, false);
  const wires = [...WIRES.filter((w) => !(w.from.part === 'us' && w.from.pin === 'ECHO') && !(w.from.part === 'div' && w.from.pin === 'OUT')), direct];
  const checks = runChecks(DEFAULT_PINMAP, undefined, wires as never);
  assert.equal(checks.find((c) => c.id === 'logic')!.status, 'fail');
});

test('electrical checks pass for the documented design and react to stall current', () => {
  const ok = runChecks(DEFAULT_PINMAP);
  for (const c of ok) assert.notEqual(c.status, 'fail', `${c.id}: ${c.detail}`);
  assert.equal(runChecks(DEFAULT_PINMAP, { motorStallA: 2, motorVoltage: 6 }).find((c) => c.id === 'current')!.status, 'warn');
  assert.equal(runChecks(DEFAULT_PINMAP, { motorStallA: 5, motorVoltage: 6 }).find((c) => c.id === 'current')!.status, 'fail');
  assert.equal(runChecks(DEFAULT_PINMAP, { motorStallA: 1, motorVoltage: 20 }).find((c) => c.id === 'vm-range')!.status, 'fail');
});

test('common ground is verified through the wire graph, and removing a ground wire breaks it', () => {
  assert.equal(groundConnected(WIRES, 'esp.GND', 'drv.GND'), true);
  const without = WIRES.filter((w) => !['P7', 'P15'].includes(w.id));
  assert.equal(groundConnected(without, 'esp.GND', 'drv.GND'), false);
});

test('pins exist on models', () => {
  assert.ok(pinExists('esp', 'GPIO26'));
  assert.ok(!pinExists('esp', 'GPIO6'));
  assert.ok(pinExists('drv', 'STBY'));
});

test('wizard state machine: navigation, phases and explicit completion', () => {
  let s = initialWizard;
  s = reduce(s, { type: 'play' });
  assert.equal(s.phase, 'playing');
  s = reduce(s, { type: 'pause' });
  assert.equal(s.phase, 'paused');
  s = reduce(s, { type: 'pause' });
  assert.equal(s.phase, 'paused');
  s = reduce(s, { type: 'resume' });
  assert.equal(s.phase, 'playing');
  s = reduce(s, { type: 'finished' });
  assert.equal(s.phase, 'finished');
  assert.deepEqual(s.completed, []); // finishing the animation never completes a stage
  s = reduce(s, { type: 'next' });
  assert.equal(s.step, 2);
  assert.equal(s.phase, 'ready');
  s = reduce(s, { type: 'prev' });
  s = reduce(s, { type: 'prev' });
  assert.equal(s.step, 1);
  for (let i = 0; i < 20; i++) s = reduce(s, { type: 'next' });
  assert.equal(s.step, STEPS.length);
  s = reduce(s, { type: 'complete', step: 3 });
  s = reduce(s, { type: 'complete', step: 3 });
  assert.deepEqual(s.completed, [3]);
  s = reduce(s, { type: 'uncomplete', step: 3 });
  assert.deepEqual(s.completed, []);
});

test('wizard gating of stages 10, 11 and 12', () => {
  const ctx: GateContext = { allWiresVerified: false, simRanOnce: false, testsDone: { obstacle: false, medication: false, fall: false, emergency: false } };
  assert.ok(completionBlock(10, ctx, []));
  assert.equal(completionBlock(10, { ...ctx, allWiresVerified: true }, []), null);
  assert.ok(completionBlock(11, { ...ctx, simRanOnce: true }, [])); // stage 10 missing
  assert.equal(completionBlock(11, { ...ctx, simRanOnce: true }, [10]), null);
  assert.ok(completionBlock(12, ctx, [10, 11]));
  assert.equal(completionBlock(12, { ...ctx, testsDone: { obstacle: true, medication: true, fall: true, emergency: true } }, [10, 11]), null);
  assert.equal(completionBlock(5, ctx, []), null);
});

test('persisted wizard state is sanitised', () => {
  assert.deepEqual(sanitize({ step: 99, completed: [1, 1, 'x', 50, 2] }), { step: 1, completed: [1, 2], phase: 'ready' });
  assert.deepEqual(sanitize(null), { step: 1, completed: [], phase: 'ready' });
});

function fakeScheduler() {
  let pending: ((t: number) => void) | null = null;
  let id = 0;
  let now = 0;
  const live = new Set<number>();
  const sched: Scheduler = {
    request: (cb) => {
      pending = cb;
      id += 1;
      live.add(id);
      return id;
    },
    cancel: (i) => {
      live.delete(i);
      pending = null;
    },
    now: () => now,
  };
  return { sched, frame: (ms: number) => { now += ms; const cb = pending; pending = null; cb?.(now); }, live: () => live.size, hasPending: () => pending !== null };
}

test('animation controller: play, pause, resume, stop, replay and no leaked frames', () => {
  const f = fakeScheduler();
  const c = new AnimationController(1000, f.sched);
  c.play();
  f.frame(250);
  assert.ok(Math.abs(c.progress - 0.25) < 1e-9);
  c.pause();
  assert.equal(f.hasPending(), false);
  f.frame(500);
  assert.ok(Math.abs(c.progress - 0.25) < 1e-9); // paused: no progress
  c.resume();
  f.frame(250);
  assert.ok(Math.abs(c.progress - 0.5) < 1e-9);
  c.stop();
  assert.equal(c.progress, 0);
  assert.equal(c.state, 'idle');
  assert.equal(f.hasPending(), false);
  c.play();
  f.frame(2000);
  assert.equal(c.state, 'done');
  assert.equal(c.progress, 1);
  c.replay();
  assert.equal(c.state, 'playing');
  assert.equal(c.progress, 0);
  c.dispose();
  assert.equal(f.hasPending(), false);
});

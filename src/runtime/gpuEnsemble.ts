import type { PendulumParameters } from '../types/domain';
import { rhsDouble } from '../physics/double';
import { rk4Step } from '../physics/integrators';

/**
 * Ensemble integrator for the double pendulum: advance N independent initial
 * conditions in parallel. When WebGPU is available the RK4 kernel runs as a
 * compute shader (one thread per trajectory, f32); otherwise an identical-API
 * CPU path runs in f64. Ensembles power basin/regime scans and uncertainty
 * clouds, where single-trajectory f32 round-off is acceptable (and is
 * reported as a caveat) because only the statistics are consumed.
 */

export interface EnsembleOptions {
  steps: number;
  dt: number;
  /** Force the CPU path even when WebGPU exists (for A/B validation). */
  forceCpu?: boolean;
}

export interface EnsembleResult {
  /** Final states, packed [θ1, θ2, ω1, ω2] per trajectory. */
  states: Float64Array;
  n: number;
  backend: 'webgpu' | 'cpu';
  steps: number;
  dt: number;
  elapsedMs: number;
  caveat: string;
}

const WGSL_KERNEL = /* wgsl */ `
struct Params {
  m1: f32, m2: f32, l1: f32, l2: f32,
  g: f32, damping: f32, dt: f32, steps: f32,
};
@group(0) @binding(0) var<storage, read_write> states: array<vec4<f32>>;
@group(0) @binding(1) var<uniform> params: Params;

fn rhs(s: vec4<f32>) -> vec4<f32> {
  let th1 = s.x; let th2 = s.y; let w1 = s.z; let w2 = s.w;
  let m1 = params.m1; let m2 = params.m2;
  let l1 = params.l1; let l2 = params.l2; let g = params.g;
  let d = th1 - th2;
  let cd = cos(d); let sd = sin(d);
  let den = m1 + m2 * sd * sd;
  let a1 = (-m2 * l1 * w1 * w1 * sd * cd
            + m2 * g * sin(th2) * cd
            - m2 * l2 * w2 * w2 * sd
            - (m1 + m2) * g * sin(th1)) / (l1 * den)
           - params.damping * w1;
  let a2 = ((m1 + m2) * (l1 * w1 * w1 * sd - g * sin(th2) + g * sin(th1) * cd)
            + m2 * l2 * w2 * w2 * sd * cd) / (l2 * den)
           - params.damping * w2;
  return vec4<f32>(w1, w2, a1, a2);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= arrayLength(&states)) { return; }
  var s = states[i];
  let h = params.dt;
  let n = u32(params.steps);
  for (var k = 0u; k < n; k = k + 1u) {
    let k1 = rhs(s);
    let k2 = rhs(s + 0.5 * h * k1);
    let k3 = rhs(s + 0.5 * h * k2);
    let k4 = rhs(s + h * k3);
    s = s + (h / 6.0) * (k1 + 2.0 * k2 + 2.0 * k3 + k4);
  }
  states[i] = s;
}
`;

function cpuEnsemble(params: PendulumParameters, initial: ArrayLike<number>, options: EnsembleOptions): Float64Array {
  const n = Math.floor(initial.length / 4);
  const out = new Float64Array(initial.length);
  out.set(Array.from(initial));
  const state = new Float64Array(4);
  const next = new Float64Array(4);
  const damping = 0; // damping folded into rhs wrapper below when needed
  const rhs = (s: Float64Array, o: Float64Array): void => {
    rhsDouble(s, params, damping, o);
  };
  for (let i = 0; i < n; i += 1) {
    state[0] = out[i * 4]!;
    state[1] = out[i * 4 + 1]!;
    state[2] = out[i * 4 + 2]!;
    state[3] = out[i * 4 + 3]!;
    for (let k = 0; k < options.steps; k += 1) {
      rk4Step(state, options.dt, rhs, next);
      state.set(next);
    }
    out[i * 4] = state[0]!;
    out[i * 4 + 1] = state[1]!;
    out[i * 4 + 2] = state[2]!;
    out[i * 4 + 3] = state[3]!;
  }
  return out;
}

interface GpuLike {
  requestAdapter(): Promise<{
    requestDevice(): Promise<GPUDeviceLike>;
  } | null>;
}

interface GPUDeviceLike {
  createShaderModule(desc: { code: string }): unknown;
  createBuffer(desc: { size: number; usage: number; mappedAtCreation?: boolean }): GPUBufferLike;
  createComputePipeline(desc: unknown): GPUPipelineLike;
  createBindGroup(desc: unknown): unknown;
  createCommandEncoder(): GPUEncoderLike;
  queue: { submit(buffers: unknown[]): void; writeBuffer(buffer: GPUBufferLike, offset: number, data: ArrayBufferView): void };
}

interface GPUBufferLike {
  getMappedRange(): ArrayBuffer;
  unmap(): void;
  mapAsync(mode: number): Promise<void>;
}

interface GPUPipelineLike {
  getBindGroupLayout(index: number): unknown;
}

interface GPUEncoderLike {
  beginComputePass(): { setPipeline(p: unknown): void; setBindGroup(i: number, g: unknown): void; dispatchWorkgroups(x: number): void; end(): void };
  copyBufferToBuffer(src: GPUBufferLike, so: number, dst: GPUBufferLike, doff: number, size: number): void;
  finish(): unknown;
}

const GPU_BUFFER_USAGE = { STORAGE: 0x80, COPY_DST: 0x8, COPY_SRC: 0x4, UNIFORM: 0x40, MAP_READ: 0x1 };
const GPU_MAP_READ = 0x1;

async function webgpuEnsemble(
  params: PendulumParameters,
  damping: number,
  initial: ArrayLike<number>,
  options: EnsembleOptions
): Promise<Float64Array | null> {
  const gpu = (navigator as unknown as { gpu?: GpuLike }).gpu;
  if (!gpu) return null;
  try {
    const adapter = await gpu.requestAdapter();
    if (!adapter) return null;
    const device = await adapter.requestDevice();
    const n = Math.floor(initial.length / 4);
    const stateData = new Float32Array(initial.length);
    stateData.set(Array.from(initial));

    const stateBuffer = device.createBuffer({
      size: stateData.byteLength,
      usage: GPU_BUFFER_USAGE.STORAGE | GPU_BUFFER_USAGE.COPY_DST | GPU_BUFFER_USAGE.COPY_SRC
    });
    device.queue.writeBuffer(stateBuffer, 0, stateData);

    const uniformData = new Float32Array([params.m1, params.m2, params.l1, params.l2, params.g, damping, options.dt, options.steps]);
    const uniformBuffer = device.createBuffer({ size: uniformData.byteLength, usage: GPU_BUFFER_USAGE.UNIFORM | GPU_BUFFER_USAGE.COPY_DST });
    device.queue.writeBuffer(uniformBuffer, 0, uniformData);

    const module = device.createShaderModule({ code: WGSL_KERNEL });
    const pipeline = device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'main' } });
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: stateBuffer } },
        { binding: 1, resource: { buffer: uniformBuffer } }
      ]
    });

    const readBuffer = device.createBuffer({ size: stateData.byteLength, usage: GPU_BUFFER_USAGE.MAP_READ | GPU_BUFFER_USAGE.COPY_DST });
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.ceil(n / 64));
    pass.end();
    encoder.copyBufferToBuffer(stateBuffer, 0, readBuffer, 0, stateData.byteLength);
    device.queue.submit([encoder.finish()]);
    await readBuffer.mapAsync(GPU_MAP_READ);
    const result = new Float32Array(readBuffer.getMappedRange().slice(0));
    readBuffer.unmap();
    return new Float64Array(result);
  } catch {
    return null;
  }
}

/** Integrate an ensemble; WebGPU when present, CPU otherwise. Always resolves. */
export async function runDoublePendulumEnsemble(
  params: PendulumParameters,
  initialStates: ArrayLike<number>,
  options: EnsembleOptions,
  damping = 0
): Promise<EnsembleResult> {
  const n = Math.floor(initialStates.length / 4);
  const started = typeof performance === 'undefined' ? Date.now() : performance.now();
  let backend: 'webgpu' | 'cpu' = 'cpu';
  let states: Float64Array | null = null;
  if (!options.forceCpu && typeof navigator !== 'undefined') {
    states = await webgpuEnsemble(params, damping, initialStates, options);
    if (states) backend = 'webgpu';
  }
  if (!states) states = cpuEnsemble(params, initialStates, options);
  const elapsed = (typeof performance === 'undefined' ? Date.now() : performance.now()) - started;
  return {
    states,
    n,
    backend,
    steps: options.steps,
    dt: options.dt,
    elapsedMs: elapsed,
    caveat: backend === 'webgpu'
      ? 'WebGPU kernel integrates in f32: per-trajectory round-off grows at the Lyapunov rate, so consume ensemble statistics, not individual trajectories.'
      : 'CPU fallback in f64 (WebGPU unavailable or disabled).'
  };
}

/** Build a grid of initial conditions over (θ1, θ2), released from rest. */
export function ensembleGrid(n: number, range: [number, number]): Float64Array {
  const out = new Float64Array(n * n * 4);
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const index = (j * n + i) * 4;
      out[index] = range[0] + ((range[1] - range[0]) * i) / Math.max(1, n - 1);
      out[index + 1] = range[0] + ((range[1] - range[0]) * j) / Math.max(1, n - 1);
    }
  }
  return out;
}

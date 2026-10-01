// "混沌游戏"(正向迭代):海量粒子各自随机套用 A、B、A⁻¹、B⁻¹(禁止 x 紧接 x⁻¹),
// 把落点累加进直方图 —— 这就是推文里 "迭代点聚集成极限集" 的做法。WebGPU compute 实现。
// 直方图按 "最近一次用到的生成元" 分 4 个通道,用来着色(青/紫/蓝/粉)。

const COMPUTE = /* wgsl */ `
struct P { gens: array<vec4f, 8>, view: vec4f, res: vec2f, seed: u32, n: u32, steps: u32, burn: u32, _p0: u32, _p1: u32 };
@group(0) @binding(0) var<uniform> P_: P;
@group(0) @binding(1) var<storage, read_write> parts: array<vec4f>;   // xy = z, z = 上一个字母, w = 年龄
@group(0) @binding(2) var<storage, read_write> hist: array<atomic<u32>>;

fn pcg(v: u32) -> u32 {
  let s = v * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
fn cmul(a: vec2f, b: vec2f) -> vec2f { return vec2f(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x); }
fn cdiv(a: vec2f, b: vec2f) -> vec2f { return vec2f(a.x*b.x + a.y*b.y, a.y*b.x - a.x*b.y) / dot(b, b); }

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= P_.n) { return; }
  var s = pcg(i * 9781u + P_.seed * 6271u + 1u);
  var st = parts[i];
  var z = st.xy;
  var prev = i32(st.z);
  var age = st.w;
  for (var k = 0u; k < P_.steps; k++) {
    s = pcg(s);
    var g = (prev + 3 + i32(s % 3u)) % 4;           // 排除 prev 的逆 (prev+2)%4
    if (prev < 0) { g = i32(s % 4u); }
    let a = P_.gens[2 * g]; let b = P_.gens[2 * g + 1];
    let num = cmul(a.xy, z) + a.zw;
    let den = cmul(b.xy, z) + b.zw;
    z = cdiv(num, den);
    prev = g;
    age += 1.0;
    if (any(z != z) || dot(z, z) > 1e8) {           // 飞到无穷或 NaN:重新播种
      s = pcg(s); let r1 = f32(s & 0xffffu) / 65535.0;
      s = pcg(s); let r2 = f32(s & 0xffffu) / 65535.0;
      z = vec2f(r1 - 0.5, r2 - 0.5); prev = -1; age = 0.0;
      continue;
    }
    if (age > f32(P_.burn)) {
      let px = (z.x - P_.view.x) / P_.view.z * P_.res.y + 0.5 * P_.res.x;
      let py = 0.5 * P_.res.y - (z.y - P_.view.y) / P_.view.z * P_.res.y;
      if (px >= 0.0 && py >= 0.0 && px < P_.res.x && py < P_.res.y) {
        let idx = (u32(py) * u32(P_.res.x) + u32(px)) * 4u + u32(g);
        atomicAdd(&hist[idx], 1u);
      }
    }
  }
  parts[i] = vec4f(z, f32(prev), age);
}
`

const RENDER = /* wgsl */ `
struct R { res: vec2f, gain: f32, mode: f32, cols: array<vec4f, 4> };
@group(0) @binding(0) var<uniform> r: R;
@group(0) @binding(1) var<storage, read> hist: array<u32>;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  var q = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(q[i], 0.0, 1.0);
}
@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let x = u32(pos.x); let y = u32(pos.y);
  let base = (y * u32(r.res.x) + x) * 4u;
  var col = vec3f(0.0); var tot = 0.0;
  // 轻微的 3x3 模糊,让稀疏的点更连贯
  for (var dy = -1; dy <= 1; dy++) { for (var dx = -1; dx <= 1; dx++) {
    let xx = i32(x) + dx; let yy = i32(y) + dy;
    if (xx < 0 || yy < 0 || xx >= i32(r.res.x) || yy >= i32(r.res.y)) { continue; }
    let w = select(0.5, 1.0, dx == 0 && dy == 0);
    let b = (u32(yy) * u32(r.res.x) + u32(xx)) * 4u;
    for (var g = 0u; g < 4u; g++) {
      let c = f32(hist[b + g]) * w;
      col += r.cols[g].rgb * c; tot += c;
    }
  }}
  var outc = vec3f(0.02, 0.03, 0.07);
  if (tot > 0.0) {
    let hue = col / tot;
    let v = 1.0 - exp(-r.gain * log(1.0 + tot) * 0.35);
    outc = mix(outc, hue * 1.25, clamp(v, 0.0, 1.0));
  }
  return vec4f(outc, 1.0);
}
`

const HEX = ['#3fd3ff', '#a98bff', '#5b8cff', '#ff7fd0']
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)

export class ChaosGame {
  constructor(device, canvas, { particles = 16384, steps = 8 } = {}) {
    this.device = device
    this.canvas = canvas
    this.n = particles
    this.steps = steps
    this.burn = 12
    this.total = 0
    this.frameNo = 0
    this.view = { cx: 0, cy: 0, scale: 4 }
    this.gain = 1.4
    this.colors = HEX.map(hex)
    this.ctx = canvas.getContext('webgpu')
    this.format = navigator.gpu.getPreferredCanvasFormat()
    this.ctx.configure({ device, format: this.format, alphaMode: 'opaque' })
    this.gens = new Float32Array(32)
    this.pbuf = device.createBuffer({ size: 32 * 4 + 16 + 8 + 4 * 6, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
    this.parts = device.createBuffer({ size: particles * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST })
    this.rbuf = device.createBuffer({ size: 16 + 16 * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
    const cm = device.createShaderModule({ code: COMPUTE })
    this.cpipe = device.createComputePipeline({ layout: 'auto', compute: { module: cm, entryPoint: 'main' } })
    const rm = device.createShaderModule({ code: RENDER })
    this.rpipe = device.createRenderPipeline({
      layout: 'auto', vertex: { module: rm, entryPoint: 'vs' },
      fragment: { module: rm, entryPoint: 'fs', targets: [{ format: this.format }] },
    })
    this.histBuf = null
    this.reset()
  }
  // mats: [A,B,A⁻¹,B⁻¹],每个 [a,b,c,d] 复数 -> 打包成 2 个 vec4:(a.xy,b.xy) (c.xy,d.xy)
  setGenerators(mats) {
    mats.forEach((m, g) => {
      this.gens.set([m[0][0], m[0][1], m[1][0], m[1][1]], g * 8)
      this.gens.set([m[2][0], m[2][1], m[3][0], m[3][1]], g * 8 + 4)
    })
    this.reset()
  }
  setView(v) { Object.assign(this.view, v); this.reset() }
  _alloc() {
    const w = this.canvas.width, h = this.canvas.height
    if (this.histBuf && this.hw === w && this.hh === h) return
    this.histBuf?.destroy()
    this.hw = w; this.hh = h; this.needClear = true
    this.histBuf = this.device.createBuffer({ size: w * h * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST })
    this.cbind = this.device.createBindGroup({ layout: this.cpipe.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: this.pbuf } }, { binding: 1, resource: { buffer: this.parts } }, { binding: 2, resource: { buffer: this.histBuf } }] })
    this.rbind = this.device.createBindGroup({ layout: this.rpipe.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: this.rbuf } }, { binding: 1, resource: { buffer: this.histBuf } }] })
  }
  reset() {
    this.total = 0; this.frameNo = 0; this.needClear = true
    // 粒子初始化在原点附近、prev=-1
    const a = new Float32Array(this.n * 4)
    for (let i = 0; i < this.n; i++) { a[i * 4] = Math.random() - 0.5; a[i * 4 + 1] = Math.random() - 0.5; a[i * 4 + 2] = -1; a[i * 4 + 3] = 0 }
    this.device.queue.writeBuffer(this.parts, 0, a)
  }
  // 推进 frames 次 dispatch 并绘制
  step(frames = 1) {
    if (fitCanvas2(this.canvas)) this.reset()
    this._alloc()
    const dev = this.device
    if (this.needClear) {
      const enc = dev.createCommandEncoder()
      enc.clearBuffer(this.histBuf)
      dev.queue.submit([enc.finish()])
      this.needClear = false
    }
    for (let f = 0; f < frames; f++) {
      const data = new ArrayBuffer(176)
      const fl = new Float32Array(data), ui = new Uint32Array(data)
      fl.set(this.gens, 0)
      fl.set([this.view.cx, this.view.cy, this.view.scale, 0], 32)
      fl.set([this.canvas.width, this.canvas.height], 36)
      ui.set([(this.frameNo++ * 2654435761) >>> 0, this.n, this.steps, this.burn], 38)
      dev.queue.writeBuffer(this.pbuf, 0, data)
      const enc = dev.createCommandEncoder()
      const pass = enc.beginComputePass()
      pass.setPipeline(this.cpipe); pass.setBindGroup(0, this.cbind)
      pass.dispatchWorkgroups(Math.ceil(this.n / 64))
      pass.end()
      dev.queue.submit([enc.finish()])   // 每次单独提交,保证每轮 seed 不被覆盖
      this.total += this.n * this.steps
    }
    this._draw()
  }
  _draw() {
    const dev = this.device
    const r = new Float32Array(4 + 16)
    r.set([this.canvas.width, this.canvas.height, this.gain, 0], 0)
    this.colors.forEach((c, i) => r.set([c[0], c[1], c[2], 1], 4 + i * 4))
    dev.queue.writeBuffer(this.rbuf, 0, r)
    const enc = dev.createCommandEncoder()
    const pass = enc.beginRenderPass({ colorAttachments: [{ view: this.ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }] })
    pass.setPipeline(this.rpipe); pass.setBindGroup(0, this.rbind); pass.draw(3); pass.end()
    dev.queue.submit([enc.finish()])
  }
}

import { fitCanvas } from './gpu.js'
function fitCanvas2(c) { return fitCanvas(c, 2) }

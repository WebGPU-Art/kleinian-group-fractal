// WebGPU 通用封装:设备、全屏片元着色器渲染器、视图交互
let devicePromise
export function getDevice() {
  if (!devicePromise) {
    devicePromise = (async () => {
      if (!navigator.gpu) throw new Error('当前浏览器不支持 WebGPU(请使用较新的 Chrome / Edge / Safari TP)')
      const adapter = await navigator.gpu.requestAdapter()
      if (!adapter) throw new Error('没有可用的 WebGPU 适配器')
      return adapter.requestDevice()
    })()
  }
  return devicePromise
}

export function showError(el, e) {
  console.error(e)
  const d = document.createElement('div')
  d.className = 'err'
  d.textContent = String(e.message || e)
  el.replaceWith(d)
}

export function fitCanvas(canvas, maxDpr = 2) {
  const dpr = Math.min(window.devicePixelRatio || 1, maxDpr)
  const w = Math.max(2, Math.round(canvas.clientWidth * dpr))
  const h = Math.max(2, Math.round(canvas.clientHeight * dpr))
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; return true }
  return false
}

// 所有全屏着色器共用的头:uniform 布局 + 顶点着色器 + 复数工具 + 调色板
export const PRELUDE = /* wgsl */ `
struct U {
  res: vec2f, center: vec2f,
  scale: f32, time: f32, iters: f32, mode: f32,
  p: array<vec4f, 12>,
};
@group(0) @binding(0) var<uniform> u: U;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  var q = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(q[i], 0.0, 1.0);
}
fn toZ(px: vec2f) -> vec2f {
  return u.center + vec2f(px.x - 0.5 * u.res.x, 0.5 * u.res.y - px.y) / u.res.y * u.scale;
}
fn cmul(a: vec2f, b: vec2f) -> vec2f { return vec2f(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x); }
fn cdiv(a: vec2f, b: vec2f) -> vec2f { return vec2f(a.x*b.x + a.y*b.y, a.y*b.x - a.x*b.y) / dot(b, b); }
fn pal(t: f32) -> vec3f { return 0.5 + 0.5 * cos(6.28318 * (vec3f(t) + vec3f(0.0, 0.33, 0.67))); }
fn genColor(k: i32) -> vec3f {
  // 与 JS 里 GEN_COLORS 对应:A 青、B 紫、A⁻¹ 蓝、B⁻¹ 粉
  if (k == 0) { return vec3f(0.25, 0.83, 1.0); }
  if (k == 1) { return vec3f(0.66, 0.55, 1.0); }
  if (k == 2) { return vec3f(0.36, 0.55, 1.0); }
  return vec3f(1.0, 0.5, 0.82);
}
`

export class Renderer {
  constructor(device, canvas, body, { floats = 8 + 4 * 12 } = {}) {
    this.device = device
    this.canvas = canvas
    this.ctx = canvas.getContext('webgpu')
    this.format = navigator.gpu.getPreferredCanvasFormat()
    this.ctx.configure({ device, format: this.format, alphaMode: 'opaque' })
    this.u = new Float32Array(floats)
    this.buf = device.createBuffer({ size: floats * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
    const module = device.createShaderModule({ code: PRELUDE + body })
    module.getCompilationInfo?.().then((info) => {
      for (const m of info.messages) if (m.type === 'error') console.error('WGSL', m.lineNum, m.message)
    })
    this.pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [{ format: this.format }] },
      primitive: { topology: 'triangle-list' },
    })
    this.bind = device.createBindGroup({ layout: this.pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: this.buf } }] })
    this.view = { cx: 0, cy: 0, scale: 4 }
    this.iters = 30
    this.mode = 0
  }
  setP(i, x = 0, y = 0, z = 0, w = 0) { this.u.set([x, y, z, w], 8 + 4 * i) }
  draw(time = 0) {
    fitCanvas(this.canvas)
    const u = this.u
    u[0] = this.canvas.width; u[1] = this.canvas.height
    u[2] = this.view.cx; u[3] = this.view.cy; u[4] = this.view.scale
    u[5] = time; u[6] = this.iters; u[7] = this.mode
    this.device.queue.writeBuffer(this.buf, 0, u)
    const enc = this.device.createCommandEncoder()
    const pass = enc.beginRenderPass({
      colorAttachments: [{ view: this.ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }],
    })
    pass.setPipeline(this.pipeline)
    pass.setBindGroup(0, this.bind)
    pass.draw(3)
    pass.end()
    this.device.queue.submit([enc.finish()])
  }
}

// 画布 <-> 复平面坐标
export function pixToZ(canvas, view, ev) {
  const r = canvas.getBoundingClientRect()
  const x = ev.clientX - r.left, y = ev.clientY - r.top
  return [view.cx + ((x - r.width / 2) / r.height) * view.scale, view.cy + ((r.height / 2 - y) / r.height) * view.scale]
}

// 拖动平移 + 滚轮缩放(以光标为中心)
export function attachPanZoom(canvas, view, onChange, { enabled = () => true } = {}) {
  let drag = null
  canvas.addEventListener('pointerdown', (e) => {
    if (!enabled(e)) return
    drag = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy }
    canvas.setPointerCapture(e.pointerId)
  })
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return
    const r = canvas.getBoundingClientRect()
    view.cx = drag.cx - ((e.clientX - drag.x) / r.height) * view.scale
    view.cy = drag.cy + ((e.clientY - drag.y) / r.height) * view.scale
    onChange()
  })
  const up = () => { drag = null }
  canvas.addEventListener('pointerup', up)
  canvas.addEventListener('pointercancel', up)
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault()
    const before = pixToZ(canvas, view, e)
    view.scale *= Math.exp(e.deltaY * 0.0012)
    const after = pixToZ(canvas, view, e)
    view.cx += before[0] - after[0]
    view.cy += before[1] - after[1]
    onChange()
  }, { passive: false })
}

export function nav(active) {
  const items = [['index.html', '首页'], ['tutorial.html', '① 原理讲解'], ['variants.html', '② 玩法变种'], ['play-chaos.html', '③ 混沌游戏'], ['play-schottky.html', 'Schottky 编辑器'], ['play-maskit.html', 'Maskit 探索'], ['play-inversion.html', '反演群'], ['play-3d.html', '3D 球反演']]
  const el = document.createElement('nav')
  el.className = 'top'
  el.innerHTML = '<b>Kleinian 分形</b>' + items.map(([h, t]) => `<a href="./${h}" class="${h === active ? 'on' : ''}">${t}</a>`).join('')
  document.body.prepend(el)
}

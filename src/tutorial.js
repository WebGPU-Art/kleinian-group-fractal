import { getDevice, showError, Renderer, attachPanZoom, pixToZ } from './gpu.js'
import { MOBIUS_DEMO, SCHOTTKY, MASKIT } from './shaders.js'
import { ChaosGame } from './chaos.js'
import { grandma, maskit, mmul, mapply, mobiusCircle, circleImage, ID, GEN_COLORS, schottkyFoldPath } from './math.js'
import { $, slider, select, button, Plot2D, circleEditor } from './ui.js'

const cx = (a, b) => [a, b]
// ---------- 全局群(步骤 2-4 共用) ----------
const G = { ta: [1.8, 0.4], tb: [1.8, 0.4], gens: null }
const listeners = []
const onGroup = (f) => listeners.push(f)
const setGroup = () => { G.gens = grandma(G.ta, G.tb); listeners.forEach((f) => f()) }

// 在可能穿过 ∞ 的折线里断开(用于画直线的像)
function polyBreak(plot, pts, color, lw) {
  let seg = []
  const flush = () => { if (seg.length > 1) plot.poly(seg, color, lw); seg = [] }
  for (const p of pts) {
    if (!isFinite(p[0]) || !isFinite(p[1]) || Math.hypot(p[0], p[1]) > 40) { flush(); continue }
    if (seg.length && Math.hypot(p[0] - seg[seg.length - 1][0], p[1] - seg[seg.length - 1][1]) > 6) flush()
    seg.push(p)
  }
  flush()
}

// ---------- 步骤 1:Möbius ----------
async function step1(dev) {
  const st = { ar: 0.8, ai: 0.5, br: 0.6, bi: 0, cr: 0.35, ci: 0.2 }
  const R1 = new Renderer(dev, $('#m1'), MOBIUS_DEMO), R2 = new Renderer(dev, $('#m2'), MOBIUS_DEMO)
  R1.view = { cx: 0, cy: 0, scale: 6 }; R2.view = R1.view; R1.mode = 0; R2.mode = 1
  const p3 = new Plot2D($('#m3'), R1.view)
  const ctl = $('#mctl')
  const draw = () => {
    const a = [st.ar, st.ai], b = [st.br, st.bi], c = [st.cr, st.ci]
    // d = (1 + b c) / a  以保证 ad - bc = 1
    const bc = [b[0] * c[0] - b[1] * c[1], b[0] * c[1] + b[1] * c[0]]
    const num = [1 + bc[0], bc[1]], den = a[0] * a[0] + a[1] * a[1]
    const d = [(num[0] * a[0] + num[1] * a[1]) / den, (num[1] * a[0] - num[0] * a[1]) / den]
    const m = [a, b, c, d]
    for (const R of [R1, R2]) { R.setP(0, a[0], a[1], b[0], b[1]); R.setP(1, c[0], c[1], d[0], d[1]); R.draw() }
    $('#mmat').textContent = `T = [[${f(a)}, ${f(b)}], [${f(c)}, ${f(d)}]]   (d 自动取 (1+bc)/a,使 ad−bc=1)`
    p3.clear(); p3.axes()
    const circ = (t) => ({ c: [0.9, 0.7], r: 0.55 }), C = circ()
    const line = Array.from({ length: 400 }, (_, i) => [-12 + (i * 24) / 399, -0.9])
    p3.circle(C.c, C.r, '#444b66', 1.5); p3.poly(line, '#444b66', 1.5)
    polyBreak(p3, circleImage(m, C.c, C.r, 160), '#3fd3ff', 2.5)
    polyBreak(p3, line.map((p) => mapply(m, p)), '#ffb85c', 2.5)
    p3.text([-2.8, 2.6], '蓝:圆 → 圆    橙:直线 → 圆/直线', '#aab', 13)
  }
  const f = (z) => `${z[0].toFixed(2)}${z[1] >= 0 ? '+' : '−'}${Math.abs(z[1]).toFixed(2)}i`
  const row = document.createElement('div'); ctl.appendChild(row)
  const mk = (k, label, min, max) => slider(row, label, { min, max, step: 0.01, value: st[k] }, (v) => { st[k] = v; draw() })
  const sl = { ar: mk('ar', 'Re a', -2, 2), ai: mk('ai', 'Im a', -2, 2), br: mk('br', 'Re b', -2, 2), bi: mk('bi', 'Im b', -2, 2), cr: mk('cr', 'Re c', -2, 2), ci: mk('ci', 'Im c', -2, 2) }
  const P = { '平移 z+1': [1, 0, 1, 0, 0, 0], '旋转缩放 (0.8+0.5i)z': [0.8, 0.5, 0, 0, 0, 0], '反演 1/z (近似)': [0.001, 0, 0, 1, 1, 0], '一般': [0.8, 0.5, 0.6, 0, 0.35, 0.2] }
  const pb = document.createElement('div'); ctl.appendChild(pb)
  for (const [k, v] of Object.entries(P)) button(pb, k, () => { ['ar', 'ai', 'br', 'bi', 'cr', 'ci'].forEach((n, i) => { st[n] = v[i]; sl[n].set(v[i]) }); draw() })
  draw()
}

// ---------- 步骤 2:群选择 + 圆树 ----------
function step2() {
  const ctl = $('#gctl')
  const upd = (k, i) => (v) => { G[k][i] = v; setGroup() }
  const s = []
  s.push(slider(ctl, 'Re tr A', { min: 0.5, max: 3.5, step: 0.01, value: G.ta[0] }, upd('ta', 0)))
  s.push(slider(ctl, 'Im tr A', { min: -1.5, max: 1.5, step: 0.01, value: G.ta[1] }, upd('ta', 1)))
  s.push(slider(ctl, 'Re tr B', { min: 0.5, max: 3.5, step: 0.01, value: G.tb[0] }, upd('tb', 0)))
  s.push(slider(ctl, 'Im tr B', { min: -1.5, max: 1.5, step: 0.01, value: G.tb[1] }, upd('tb', 1)))
  const pb = document.createElement('div'); ctl.appendChild(pb)
  const P = { 'tr A = tr B = 1.8+0.4i': [1.8, 0.4, 1.8, 0.4], '1.9+0.05i, 2': [1.9, 0.05, 2, 0], '2+0.5i, 2−0.5i': [2, 0.5, 2, -0.5], '双尖点 2, 2': [2, 0, 2, 0], '3, 3': [3, 0, 3, 0] }
  for (const [k, v] of Object.entries(P)) button(pb, k, () => { G.ta = [v[0], v[1]]; G.tb = [v[2], v[3]]; s.forEach((sl, i) => sl.set(v[i])); setGroup() })
  const depth = slider(ctl, '圆树层数', { min: 0, max: 7, step: 1, value: 3 }, () => draw())
  const rad = slider(ctl, '起始圆半径', { min: 0.05, max: 0.6, step: 0.01, value: 0.2 }, () => draw())

  const plot = new Plot2D($('#t1'), { cx: 0, cy: 0, scale: 5 })
  attachPanZoom($('#t1'), plot.view, () => draw(), { enabled: (e) => e.shiftKey })
  let base = [0.0, 0.0]
  const cv = $('#t1')
  const place = (e) => { if (e.shiftKey) return; base = plot.z(e); draw() }
  cv.addEventListener('pointerdown', (e) => { place(e); cv.setPointerCapture(e.pointerId) })
  cv.addEventListener('pointermove', (e) => { if (e.buttons && !e.shiftKey) place(e) })
  function draw() {
    plot.clear(); plot.axes()
    const D = depth.get(), r0 = rad.get()
    // 逐层构造:每个节点 = 矩阵 m;圆 = m(起始圆);连线连父子圆心
    let level = [{ m: ID, last: -1, first: -1, c: base, r: r0 }]
    let count = 1
    const all = []
    for (let d = 1; d <= D; d++) {
      const next = []
      for (const w of level) {
        for (let g = 0; g < 4; g++) {
          if (w.last >= 0 && g === (w.last + 2) % 4) continue
          const m = mmul(w.m, G.gens[g])
          const C = mobiusCircle(m, base, r0)
          if (!C) continue
          next.push({ m, last: g, first: w.first < 0 ? g : w.first, c: C.c, r: C.r, parent: w })
        }
      }
      all.push(...next); level = next; count = next.length
    }
    for (const w of all) {
      const col = GEN_COLORS[w.first]
      if (w.parent.c && w.r < 30) { plot.poly([w.parent.c, w.c], col + '55', 1) }
    }
    for (const w of all) if (w.r < 30) plot.circle(w.c, w.r, GEN_COLORS[w.first], 1.4)
    plot.circle(base, r0, '#ffc857', 2.8)
    $('#t1cap').textContent = `第 ${D} 层:${D === 0 ? 1 : 4 * Math.pow(3, D - 1)} 个圆 (拖动 / 点击移动黄色起始圆;按住 Shift 拖动平移,滚轮缩放)`
  }
  onGroup(draw)
  cv.addEventListener('wheel', (e) => { e.preventDefault(); const b = pixToZ(cv, plot.view, e); plot.view.scale *= Math.exp(e.deltaY * 0.0012); const a = pixToZ(cv, plot.view, e); plot.view.cx += b[0] - a[0]; plot.view.cy += b[1] - a[1]; draw() }, { passive: false })
  draw()
}

// ---------- 步骤 3:随机轨道 ----------
function step3() {
  const ctl = $('#octl'); const plot = new Plot2D($('#o1'), { cx: 0, cy: 0, scale: 5 })
  const steps = slider(ctl, '步数 N', { min: 10, max: 20000, step: 10, value: 2000 }, () => draw())
  let z0 = [0.3, 0.2]
  button(ctl, '重新随机走', () => draw())
  const cv = $('#o1')
  cv.addEventListener('pointerdown', (e) => { z0 = plot.z(e); draw() })
  function draw() {
    plot.clear(); plot.axes()
    let z = z0, prev = -1
    const path = [z]
    const N = steps.get()
    for (let i = 0; i < N; i++) {
      const g = prev < 0 ? Math.floor(Math.random() * 4) : (prev + 3 + Math.floor(Math.random() * 3)) % 4
      z = mapply(G.gens[g], z); prev = g
      if (!isFinite(z[0]) || Math.hypot(z[0], z[1]) > 1e6) { z = [Math.random() - 0.5, Math.random() - 0.5]; prev = -1; continue }
      if (i < 30) path.push(z)
      else plot.dot(z, 1.3, GEN_COLORS[g])
    }
    plot.poly(path.filter((p) => Math.hypot(p[0], p[1]) < 30), '#ffffffaa', 1.2)
    plot.dot(z0, 4, '#ffc857')
  }
  onGroup(draw); draw()
}

// ---------- 步骤 4:混沌游戏累积 ----------
function step4(dev) {
  const V = { cx: 0, cy: 0, scale: 5 }
  const defs = [['#c1', 12 + 1], ['#c2', 12 + 10], ['#c3', 12 + 100], ['#c4', 12 + 1000]]
  const cgs = defs.map(([id, k]) => { const g = new ChaosGame(dev, $(id), { particles: 1000, steps: 1 }); g.view = V; g.gain = 1.2; return { g, k } })
  const run = () => cgs.forEach(({ g, k }) => { g.setGenerators(G.gens); g.step(k) })
  cgs.forEach(({ g }, i) => attachPanZoom($(defs[i][0]), V, run))
  onGroup(run); run()
}

// ---------- 步骤 5:反向折叠 ----------
function step5(dev) {
  const th = [0.0, 0.0]
  const mkP = (R) => {
    R.setP(0, 2)
    R.setP(1, -1.1, 0, 0.77, 0); R.setP(2, 1.1, 0, 0.77, th[0])
    R.setP(3, 0, -1.1, 0.77, 0); R.setP(4, 0, 1.1, 0.77, th[1])
  }
  const grid = $('#fgrid'), Ns = [0, 1, 2, 3, 4, 8]
  const Rs = Ns.map((n) => {
    const fg = document.createElement('figure'); fg.innerHTML = `<canvas class="c"></canvas><figcaption>最多 N = ${n} 步</figcaption>`; grid.appendChild(fg)
    const R = new Renderer(dev, fg.querySelector('canvas'), SCHOTTKY); R.view = { cx: 0, cy: 0, scale: 5.2 }; R.iters = n; R.mode = 3; return R
  })
  const cv = $('#f7'); const Rf = new Renderer(dev, cv, SCHOTTKY); Rf.view = { cx: 0, cy: 0, scale: 5.2 }; Rf.iters = 40; Rf.mode = 1
  const ed = circleEditor($('#f7ov'), cv, Rf.view, [])
  const pairs = () => [{ ca: [-1.1, 0], ra: 0.77, cA: [1.1, 0], rA: 0.77, theta: th[0] }, { ca: [0, -1.1], ra: 0.77, cA: [0, 1.1], rA: 0.77, theta: th[1] }]
  const draw = () => { [...Rs, Rf].forEach((R) => { mkP(R); R.draw() }) }
  cv.addEventListener('pointermove', (e) => ed.setExtra(schottkyFoldPath(pixToZ(cv, Rf.view, e), pairs(), 30)))
  cv.addEventListener('pointerleave', () => ed.setExtra(null))
  const ctl = $('#fctl')
  slider(ctl, '扭转 θ₁', { min: -3.14, max: 3.14, step: 0.01, value: 0 }, (v) => { th[0] = v; draw() })
  slider(ctl, '扭转 θ₂', { min: -3.14, max: 3.14, step: 0.01, value: 0 }, (v) => { th[1] = v; draw() })
  draw()
}

// ---------- 步骤 6:Maskit 对照 ----------
function step6(dev) {
  const st = { a: 1.9, b: 0.05 }
  const V = { cx: 0, cy: 1, scale: 3.4 }
  const cg = new ChaosGame(dev, $('#k1'), { particles: 32768, steps: 8 }); cg.view = V
  const R = new Renderer(dev, $('#k2'), MASKIT); R.view = V; R.iters = 80; R.mode = 2
  let frames = 0
  const apply = () => { cg.setGenerators(maskit([-st.b, st.a])); frames = 0; R.setP(0, st.a, st.b); R.draw() }
  attachPanZoom($('#k1'), V, apply); attachPanZoom($('#k2'), V, apply)
  const ctl = $('#kctl')
  slider(ctl, 'a', { min: 1.5, max: 2.4, step: 0.005, value: st.a }, (v) => { st.a = v; apply() })
  slider(ctl, 'b', { min: -0.6, max: 0.6, step: 0.005, value: st.b }, (v) => { st.b = v; apply() })
  apply()
  ;(function loop() { if (frames < 200) { cg.step(2); frames += 2 } requestAnimationFrame(loop) })()
}

;(async () => {
  setGroup()
  try { step2(); step3() } catch (e) { console.error(e) }
  try {
    const dev = await getDevice()
    await step1(dev); step4(dev); step5(dev); step6(dev)
  } catch (e) {
    console.error(e)
    document.querySelectorAll('canvas.c').forEach((c) => { if (!c.getContext('2d') && !c.dataset.err) {} })
    const d = document.createElement('div'); d.className = 'note'; d.textContent = 'WebGPU 初始化失败:' + (e.message || e); document.querySelector('main').prepend(d)
  }
})()

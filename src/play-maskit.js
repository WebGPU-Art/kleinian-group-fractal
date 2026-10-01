import { getDevice, showError, attachPanZoom, Renderer } from './gpu.js'
import { MASKIT } from './shaders.js'
import { $, slider, select, button } from './ui.js'

const cv = $('#cv'), ctl = $('#ctl')
const st = { a: 1.9, b: 0.05, tour: false }
;(async () => {
  try {
    const dev = await getDevice()
    const R = new Renderer(dev, cv, MASKIT)
    R.view = { cx: 0, cy: 1, scale: 3.4 }; R.iters = 60; R.mode = 2
    let dirty = true
    attachPanZoom(cv, R.view, () => (dirty = true))
    const sa = slider(ctl, 'a (Im c)', { min: 1.2, max: 2.6, step: 0.002, value: st.a }, (v) => { st.a = v; dirty = true; pad() })
    const sb = slider(ctl, 'b (−Re c)', { min: -1, max: 1, step: 0.002, value: st.b }, (v) => { st.b = v; dirty = true; pad() })
    select(ctl, '着色', [[0, '深度调色板'], [1, '按分支'], [2, '极限集发光']], 2, (v) => { R.mode = +v; dirty = true })
    slider(ctl, '迭代上限', { min: 5, max: 200, step: 1, value: 60 }, (v) => { R.iters = v; dirty = true })
    // 参数板
    const padc = document.createElement('canvas'); padc.style.cssText = 'width:100%;aspect-ratio:1;background:#05060a;border:1px solid var(--line);border-radius:8px;margin-top:8px;touch-action:none;cursor:crosshair'
    ctl.appendChild(padc)
    const A0 = 1.2, A1 = 2.6, B0 = -1, B1 = 1
    function pad() {
      padc.width = padc.clientWidth * 2; padc.height = padc.clientHeight * 2
      const g = padc.getContext('2d'), W = padc.width, H = padc.height
      g.fillStyle = '#05060a'; g.fillRect(0, 0, W, H)
      g.strokeStyle = '#1b2133'; g.lineWidth = 2
      const X = (a) => ((a - A0) / (A1 - A0)) * W, Y = (b) => ((B1 - b) / (B1 - B0)) * H
      g.beginPath(); g.moveTo(X(2), 0); g.lineTo(X(2), H); g.moveTo(0, Y(0)); g.lineTo(W, Y(0)); g.stroke()
      g.fillStyle = '#8d96b0'; g.font = '22px sans-serif'; g.fillText('a →', W - 60, Y(0) - 8); g.fillText('b ↑', X(2) + 8, 26)
      g.beginPath(); g.arc(X(st.a), Y(st.b), 9, 0, 7); g.fillStyle = '#ff8a5c'; g.fill()
    }
    const setFrom = (e) => {
      const r = padc.getBoundingClientRect()
      st.a = A0 + ((e.clientX - r.left) / r.width) * (A1 - A0); st.b = B1 - ((e.clientY - r.top) / r.height) * (B1 - B0)
      sa.set(st.a); sb.set(st.b); dirty = true; pad()
    }
    let down = false
    padc.addEventListener('pointerdown', (e) => { down = true; padc.setPointerCapture(e.pointerId); setFrom(e) })
    padc.addEventListener('pointermove', (e) => down && setFrom(e))
    padc.addEventListener('pointerup', () => (down = false))
    const presets = document.createElement('div'); presets.style.marginTop = '8px'; ctl.appendChild(presets)
    const P = { '双尖点 a=2,b=0': [2, 0], '准 Fuchsian 1.9, 0.05': [1.9, 0.05], '1.95, 0.2': [1.95, 0.2], '1.8, 0.3': [1.8, 0.3], '2.2, 0.0 (Cantor 尘)': [2.2, 0] }
    for (const [k, v] of Object.entries(P)) button(presets, k, () => { [st.a, st.b] = v; sa.set(v[0]); sb.set(v[1]); dirty = true; pad() })
    button(presets, '巡游 ▶/■', () => (st.tour = !st.tour))
    button(presets, '重置视图', () => { Object.assign(R.view, { cx: 0, cy: 1, scale: 3.4 }); dirty = true })
    new ResizeObserver(() => { dirty = true; pad() }).observe(cv)
    pad()
    ;(function loop(t) {
      if (st.tour) { st.a = 1.92 + 0.08 * Math.sin(t * 0.0006); st.b = 0.2 * Math.sin(t * 0.00037); sa.set(st.a); sb.set(st.b); dirty = true; pad() }
      if (dirty) { R.setP(0, st.a, st.b); R.draw(); dirty = false }
      requestAnimationFrame(loop)
    })(0)
  } catch (e) { showError(cv, e) }
})()

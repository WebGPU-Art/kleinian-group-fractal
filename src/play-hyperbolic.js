import { getDevice, showError, attachPanZoom, Renderer } from './gpu.js'
import { HYPERBOLIC } from './shaders.js'
import { $, slider, select, button } from './ui.js'

const cv = $('#cv'), ctl = $('#ctl')
const st = { p: 5, q: 4 }
;(async () => {
  try {
    const dev = await getDevice()
    const R = new Renderer(dev, cv, HYPERBOLIC)
    R.view = { cx: 0, cy: 0, scale: 2.2 }; R.iters = 80; R.mode = 0
    const info = $('#info')
    const draw = () => {
      const { p, q } = st
      const cq = Math.cos(Math.PI / q), sp = Math.sin(Math.PI / p)
      const ok = cq > sp + 1e-6
      if (!ok) { info.textContent = `{${p},${q}} 不是双曲的 (需要 1/p + 1/q < 1/2)`; R.setP(0, p, q, 1e3, 1e3 - 1); R.draw(); return }
      const d = cq / Math.sqrt(cq * cq - sp * sp), r = Math.sqrt(d * d - 1)
      info.textContent = `{${p},${q}}:圆心 d = ${d.toFixed(4)},半径 r = ${r.toFixed(4)}`
      R.setP(0, p, q, d, r); R.draw()
    }
    attachPanZoom(cv, R.view, draw)
    slider(ctl, 'p (边数)', { min: 3, max: 12, step: 1, value: st.p }, (v) => { st.p = v; draw() })
    slider(ctl, 'q (每点 q 个)', { min: 3, max: 12, step: 1, value: st.q }, (v) => { st.q = v; draw() })
    select(ctl, '着色', [[0, '奇偶双色'], [1, '折叠次数彩色']], 0, (v) => { R.mode = +v; draw() })
    slider(ctl, '迭代上限', { min: 5, max: 200, step: 1, value: 80 }, (v) => { R.iters = v; draw() })
    const pb = document.createElement('div'); ctl.appendChild(pb)
    for (const [p, q] of [[5, 4], [7, 3], [3, 7], [4, 5], [8, 3], [6, 4]]) button(pb, `{${p},${q}}`, () => { st.p = p; st.q = q; ctl.querySelectorAll('input')[0].value = p; ctl.querySelectorAll('input')[1].value = q; ctl.querySelectorAll('code')[0].textContent = p.toFixed(2); ctl.querySelectorAll('code')[1].textContent = q.toFixed(2); draw() })
    new ResizeObserver(draw).observe(cv)
    draw()
  } catch (e) { showError(cv, e) }
})()

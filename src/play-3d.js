import { getDevice, showError, Renderer } from './gpu.js'
import { APOLLONIAN3D } from './shaders.js'
import { $, slider, button } from './ui.js'

const cv = $('#cv'), ctl = $('#ctl')
const st = { yaw: 0.6, pit: 0.35, dist: 3.2, k: 1.2, auto: true }
;(async () => {
  try {
    const dev = await getDevice()
    const R = new Renderer(dev, cv, APOLLONIAN3D)
    let drag = null
    cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, yaw: st.yaw, pit: st.pit }; st.auto = false; cv.setPointerCapture(e.pointerId) })
    cv.addEventListener('pointermove', (e) => { if (!drag) return; st.yaw = drag.yaw - (e.clientX - drag.x) * 0.006; st.pit = Math.max(-1.4, Math.min(1.4, drag.pit + (e.clientY - drag.y) * 0.006)) })
    cv.addEventListener('pointerup', () => (drag = null))
    cv.addEventListener('wheel', (e) => { e.preventDefault(); st.dist = Math.max(0.8, Math.min(8, st.dist * Math.exp(e.deltaY * 0.001))) }, { passive: false })
    slider(ctl, '反演强度 k', { min: 0.9, max: 1.5, step: 0.005, value: st.k }, (v) => (st.k = v))
    button(ctl, '自动旋转 ▶/■', () => (st.auto = !st.auto))
    ;(function loop(t) {
      if (st.auto) st.yaw += 0.004
      R.setP(0, st.yaw, st.pit, st.dist, st.k); R.draw(t / 1000)
      requestAnimationFrame(loop)
    })(0)
  } catch (e) { showError(cv, e) }
})()

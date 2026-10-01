import { getDevice, showError, Renderer } from './gpu.js'
import { MOBIUS_DEMO } from './shaders.js'
import { mmul, mnorm, cscale } from './math.js'
import { $, slider, button } from './ui.js'

const cv = $('#cv'), cv0 = $('#cv0'), ctl = $('#ctl')
const st = { pr: -1, pi: 0, qr: 1, qi: 0, lr: 0.6, th: 0.8, t: 1, play: true }
// T^t = M⁻¹ · diag(k^t, 1) · M,M = [[1,-p],[1,-q]](p → 0, q → ∞)
function matrix() {
  const p = [st.pr, st.pi], q = [st.qr, st.qi]
  const lk = [st.lr * st.t, st.th * st.t]            // t·log k
  const e = Math.exp(lk[0]), kt = [e * Math.cos(lk[1]), e * Math.sin(lk[1])]
  const M = [[1, 0], cscale(p, -1), [1, 0], cscale(q, -1)]
  const Minv = [cscale(q, -1), p, [-1, 0], [1, 0]]   // adj(M)
  const D = [kt, [0, 0], [0, 0], [1, 0]]
  return mnorm(mmul(mmul(Minv, D), M))
}
;(async () => {
  try {
    const dev = await getDevice()
    const R0 = new Renderer(dev, cv0, MOBIUS_DEMO), R1 = new Renderer(dev, cv, MOBIUS_DEMO)
    R0.view = { cx: 0, cy: 0, scale: 7 }; R1.view = R0.view; R0.mode = 0; R1.mode = 1
    const sl = {}
    const upd = (k) => (v) => { st[k] = v; draw() }
    sl.pr = slider(ctl, 'Re p', { min: -3, max: 3, step: 0.01, value: st.pr }, upd('pr'))
    sl.pi = slider(ctl, 'Im p', { min: -3, max: 3, step: 0.01, value: st.pi }, upd('pi'))
    sl.qr = slider(ctl, 'Re q', { min: -3, max: 3, step: 0.01, value: st.qr }, upd('qr'))
    sl.qi = slider(ctl, 'Im q', { min: -3, max: 3, step: 0.01, value: st.qi }, upd('qi'))
    sl.lr = slider(ctl, 'ln |k|', { min: -2, max: 2, step: 0.01, value: st.lr }, upd('lr'))
    sl.th = slider(ctl, 'arg k', { min: -3.14, max: 3.14, step: 0.01, value: st.th }, upd('th'))
    sl.t = slider(ctl, 't', { min: 0, max: 3, step: 0.01, value: st.t }, (v) => { st.t = v; st.play = false; draw() })
    const pb = document.createElement('div'); pb.style.marginTop = '8px'; ctl.appendChild(pb)
    const set = (o) => { Object.assign(st, o); for (const k of Object.keys(sl)) sl[k].set(st[k]); draw() }
    button(pb, '椭圆 |k|=1', () => set({ lr: 0, th: 1.0 }))
    button(pb, '双曲 k>0', () => set({ lr: 0.8, th: 0 }))
    button(pb, '斜驶 loxodromic', () => set({ lr: 0.6, th: 0.8 }))
    button(pb, '一个不动点在 ∞ 附近', () => set({ qr: 50, qi: 0, lr: 0.5, th: 0.6 }))
    button(pb, '播放/暂停 ▶/■', () => (st.play = !st.play))
    const info = $('#info')
    function draw() {
      const m = matrix()
      for (const R of [R0, R1]) { R.setP(0, m[0][0], m[0][1], m[1][0], m[1][1]); R.setP(1, m[2][0], m[2][1], m[3][0], m[3][1]); R.draw() }
      const kind = Math.abs(st.lr) < 1e-3 ? '椭圆' : Math.abs(st.th) < 1e-3 ? '双曲' : '斜驶'
      info.textContent = `类型:${kind};t = ${st.t.toFixed(2)}(左:原图,右:T^t 作用后)`
    }
    ;(function loop() { if (st.play) { st.t = (st.t + 0.004) % 3; sl.t.set(st.t); draw() } requestAnimationFrame(loop) })()
    addEventListener('resize', draw)
  } catch (e) { showError(cv, e) }
})()

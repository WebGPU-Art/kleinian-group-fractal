import { getDevice, showError, attachPanZoom } from './gpu.js'
import { ChaosGame } from './chaos.js'
import { grandma, maskit, conjugateInv } from './math.js'
import { $, slider, select, button } from './ui.js'

const cv = $('#cv'), ctl = $('#ctl')
const st = { mode: 'grandma', tar: 2, tai: 0.2, tbr: 2, tbi: 0.2, a: 1.95, b: 0.1, conj: true, z0i: -1 }
const PRESETS = {
  '龙 A:2+0.2i, 2+0.2i': { tar: 2, tai: 0.2, tbr: 2, tbi: 0.2 },
  '龙 B:1.9+0.3i, 1.9+0.3i': { tar: 1.9, tai: 0.3, tbr: 1.9, tbi: 0.3 },
  '龙 C:2.1+0.15i, 2.1−0.15i': { tar: 2.1, tai: 0.15, tbr: 2.1, tbi: -0.15 },
  '龙 D:2+0.4i, 2+0.4i': { tar: 2, tai: 0.4, tbr: 2, tbi: 0.4 },
  '碎龙:1.8+0.5i, 1.8+0.5i': { tar: 1.8, tai: 0.5, tbr: 1.8, tbi: 0.5 },
  '近 Fuchsian:2.6+0.3i': { tar: 2.6, tai: 0.3, tbr: 2.6, tbi: 0.3 },
  '双尖点 2, 2(周期带)': { tar: 2, tai: 0, tbr: 2, tbi: 0 },
}
;(async () => {
  try {
    const dev = await getDevice()
    const g = new ChaosGame(dev, cv, { particles: 65536, steps: 8 })
    const apply = () => {
      if (st.mode === 'grandma') {
        const gens = grandma([st.tar, st.tai], [st.tbr, st.tbi])
        g.setGenerators(st.conj ? conjugateInv(gens, [0, st.z0i]) : gens)
      } else g.setGenerators(maskit([-st.b, st.a]))
    }
    const homeView = () => (st.mode === 'grandma' && st.conj ? { cx: 0, cy: -0.8, scale: 3.2 } : st.mode === 'grandma' ? { cx: 0, cy: 0, scale: 5 } : { cx: 0, cy: 1, scale: 3.4 })
    const view = g.view; Object.assign(view, homeView())
    attachPanZoom(cv, view, () => g.reset())
    select(ctl, '群族', [['grandma', "Grandma 配方 (tr A, tr B)"], ['maskit', 'Maskit (T, S)']], st.mode, (v) => { st.mode = v; rebuild(); Object.assign(view, homeView()); apply() })
    const box = document.createElement('div'); ctl.appendChild(box)
    function rebuild() {
      box.innerHTML = ''
      const upd = (k) => (v) => { st[k] = v; apply() }
      if (st.mode === 'grandma') {
        slider(box, 'Re tr A', { min: 0.5, max: 4, step: 0.01, value: st.tar }, upd('tar'))
        slider(box, 'Im tr A', { min: -1.5, max: 1.5, step: 0.01, value: st.tai }, upd('tai'))
        slider(box, 'Re tr B', { min: 0.5, max: 4, step: 0.01, value: st.tbr }, upd('tbr'))
        slider(box, 'Im tr B', { min: -1.5, max: 1.5, step: 0.01, value: st.tbi }, upd('tbi'))
        const cb = document.createElement('label'); cb.style.cssText = 'display:flex;gap:6px;align-items:center;margin:6px 0;color:var(--dim)'
        cb.innerHTML = `<input type="checkbox" ${st.conj ? 'checked' : ''}> 共轭 z→1/(z−z₀),把尖点从 ∞ 移到 0(得到闭合龙形)`
        cb.querySelector('input').addEventListener('change', (e) => { st.conj = e.target.checked; Object.assign(view, homeView()); apply() })
        box.appendChild(cb)
        slider(box, 'Im z₀', { min: -3, max: -0.3, step: 0.01, value: st.z0i }, upd('z0i'))
        const p = document.createElement('div'); p.innerHTML = '<p>预设:</p>'; box.appendChild(p)
        for (const [k, v] of Object.entries(PRESETS)) button(p, k, () => { Object.assign(st, v); rebuild(); apply() })
        button(p, '🎲 随机', () => { const r = (a, b) => a + Math.random() * (b - a); const ta = [r(1.7, 2.4), r(0.1, 0.6)]; Object.assign(st, { tar: ta[0], tai: ta[1], tbr: r(1.7, 2.4), tbi: r(-0.6, 0.6) }); rebuild(); apply() })
      } else {
        slider(box, 'a', { min: 1.2, max: 2.6, step: 0.005, value: st.a }, upd('a'))
        slider(box, 'b', { min: -1, max: 1, step: 0.005, value: st.b }, upd('b'))
      }
    }
    rebuild(); apply()
    slider(ctl, '亮度', { min: 0.3, max: 4, step: 0.05, value: g.gain }, (v) => { g.gain = v })
    button(ctl, '重置视图', () => { Object.assign(view, homeView()); g.reset() })
    const info = $('#info')
    ;(function loop() { g.step(2); info.textContent = `累计采样 ≈ ${(g.total / 1e6).toFixed(1)} M`; requestAnimationFrame(loop) })()
  } catch (e) { showError(cv, e) }
})()

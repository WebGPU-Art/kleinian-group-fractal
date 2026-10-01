import { getDevice, showError, attachPanZoom } from './gpu.js'
import { ChaosGame } from './chaos.js'
import { grandma, maskit } from './math.js'
import { $, slider, select, button } from './ui.js'

const cv = $('#cv'), ctl = $('#ctl')
const st = { mode: 'grandma', tar: 1.9, tai: 0.05, tbr: 2, tbi: 0, a: 1.95, b: 0.1 }
const PRESETS = {
  '双尖点 ta=tb=2': { tar: 2, tai: 0, tbr: 2, tbi: 0 },
  'ta=1.9+0.05i, tb=2 (周期带)': { tar: 1.9, tai: 0.05, tbr: 2, tbi: 0 },
  'ta=tb=1.8+0.4i': { tar: 1.8, tai: 0.4, tbr: 1.8, tbi: 0.4 },
  'ta=2.2, tb=2.2': { tar: 2.2, tai: 0, tbr: 2.2, tbi: 0 },
  'ta=2+0.5i, tb=2−0.5i': { tar: 2, tai: 0.5, tbr: 2, tbi: -0.5 },
  'ta=tb=3': { tar: 3, tai: 0, tbr: 3, tbi: 0 },
  'ta=1.5+0.7i, tb=1.5−0.7i': { tar: 1.5, tai: 0.7, tbr: 1.5, tbi: -0.7 },
}
;(async () => {
  try {
    const dev = await getDevice()
    const g = new ChaosGame(dev, cv, { particles: 65536, steps: 8 })
    const apply = () => g.setGenerators(st.mode === 'grandma' ? grandma([st.tar, st.tai], [st.tbr, st.tbi]) : maskit([-st.b, st.a]))
    const view = g.view; view.scale = 5
    attachPanZoom(cv, view, () => g.reset())
    select(ctl, '群族', [['grandma', "Grandma 配方 (tr A, tr B)"], ['maskit', 'Maskit (T, S)']], st.mode, (v) => { st.mode = v; rebuild(); apply() })
    const box = document.createElement('div'); ctl.appendChild(box)
    function rebuild() {
      box.innerHTML = ''
      const upd = (k) => (v) => { st[k] = v; apply() }
      if (st.mode === 'grandma') {
        slider(box, 'Re tr A', { min: 0.5, max: 4, step: 0.01, value: st.tar }, upd('tar'))
        slider(box, 'Im tr A', { min: -1.5, max: 1.5, step: 0.01, value: st.tai }, upd('tai'))
        slider(box, 'Re tr B', { min: 0.5, max: 4, step: 0.01, value: st.tbr }, upd('tbr'))
        slider(box, 'Im tr B', { min: -1.5, max: 1.5, step: 0.01, value: st.tbi }, upd('tbi'))
        const p = document.createElement('div'); p.innerHTML = '<p>预设:</p>'; box.appendChild(p)
        for (const [k, v] of Object.entries(PRESETS)) button(p, k, () => { Object.assign(st, v); rebuild(); apply() })
      } else {
        slider(box, 'a', { min: 1.2, max: 2.6, step: 0.005, value: st.a }, upd('a'))
        slider(box, 'b', { min: -1, max: 1, step: 0.005, value: st.b }, upd('b'))
      }
    }
    rebuild(); apply()
    slider(ctl, '亮度', { min: 0.3, max: 4, step: 0.05, value: g.gain }, (v) => { g.gain = v })
    button(ctl, '重置视图', () => { Object.assign(view, { cx: 0, cy: 0, scale: 5 }); g.reset() })
    const info = $('#info')
    ;(function loop() { g.step(2); info.textContent = `累计采样 ≈ ${(g.total / 1e6).toFixed(1)} M`; requestAnimationFrame(loop) })()
  } catch (e) { showError(cv, e) }
})()

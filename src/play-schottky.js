import { getDevice, showError, attachPanZoom, Renderer, pixToZ } from './gpu.js'
import { SCHOTTKY } from './shaders.js'
import { schottkyFoldPath } from './math.js'
import { $, slider, select, button, circleEditor } from './ui.js'

const cv = $('#cv'), ov = $('#ov'), ctl = $('#ctl')
const COLS = ['#3fd3ff', '#5b8cff', '#a98bff', '#ff7fd0', '#ffd27a', '#7dffb0']
// 每对:circles[2k] = a 圆,circles[2k+1] = A 圆;theta[k] 为扭转角
const circles = [
  { x: -1.1, y: 0, r: 0.77, label: 'a' }, { x: 1.1, y: 0, r: 0.77, label: 'A' },
  { x: 0, y: -1.1, r: 0.77, label: 'b' }, { x: 0, y: 1.1, r: 0.77, label: 'B' },
  { x: -1.9, y: 1.9, r: 0.45, label: 'c' }, { x: 1.9, y: -1.9, r: 0.45, label: 'C' },
]
circles.forEach((c, i) => (c.color = COLS[i]))
const theta = [0.5, -0.5, 0]
let np = 2
;(async () => {
  try {
    const dev = await getDevice()
    const R = new Renderer(dev, cv, SCHOTTKY)
    R.view = { cx: 0, cy: 0, scale: 5.5 }; R.iters = 40; R.mode = 1
    const pairs = () => Array.from({ length: np }, (_, k) => ({ ca: [circles[2 * k].x, circles[2 * k].y], ra: circles[2 * k].r, cA: [circles[2 * k + 1].x, circles[2 * k + 1].y], rA: circles[2 * k + 1].r, theta: theta[k] }))
    const draw = () => {
      R.setP(0, np)
      for (let k = 0; k < np; k++) { const a = circles[2 * k], A = circles[2 * k + 1]; R.setP(1 + 2 * k, a.x, a.y, a.r, 0); R.setP(2 + 2 * k, A.x, A.y, A.r, theta[k]) }
      R.draw()
    }
    const items = circles.slice(0, 2 * np)
    const ed = circleEditor(ov, cv, R.view, items, { onChange: draw })
    cv.addEventListener('pointermove', (e) => ed.setExtra(schottkyFoldPath(pixToZ(cv, R.view, e), pairs(), 30)))
    const rebuildEditor = () => { items.length = 0; circles.slice(0, 2 * np).forEach((c) => items.push(c)); ed.draw(); draw() }
    attachPanZoom(cv, R.view, () => { ed.draw(); draw() })
    new ResizeObserver(() => { ed.draw(); draw() }).observe(cv)
    select(ctl, '圆对数', [[1, '1 对 (退化)'], [2, '2 对'], [3, '3 对']], 2, (v) => { np = +v; rebuildEditor(); sliders() })
    select(ctl, '着色', [[0, '折叠深度调色板'], [1, '按生成元着色'], [2, '极限集发光'], [3, '教学:未完成变暗']], 1, (v) => { R.mode = +v; draw() })
    slider(ctl, '迭代上限', { min: 1, max: 120, step: 1, value: 40 }, (v) => { R.iters = v; draw() })
    const tbox = document.createElement('div'); ctl.appendChild(tbox)
    function sliders() { tbox.innerHTML = ''; for (let k = 0; k < np; k++) slider(tbox, `扭转 θ${k + 1}`, { min: -3.14, max: 3.14, step: 0.01, value: theta[k] }, (v) => { theta[k] = v; draw() }) }
    sliders()
    button(ctl, '全部扭转归零', () => { theta.fill(0); sliders(); draw() })
    button(ctl, '重置视图', () => { Object.assign(R.view, { cx: 0, cy: 0, scale: 5.5 }); ed.draw(); draw() })
    draw()
  } catch (e) { showError(cv, e) }
})()

import { getDevice, showError, attachPanZoom, Renderer } from './gpu.js'
import { INVERSION } from './shaders.js'
import { $, slider, select, button, circleEditor } from './ui.js'

const cv = $('#cv'), ov = $('#ov'), ctl = $('#ctl')
const COLS = ['#3fd3ff', '#a98bff', '#5b8cff', '#ff7fd0', '#ffd27a', '#7dffb0', '#ff9a5c', '#c0c8ff']
const PRESETS = {
  Apollonian: () => {
    const r = 2 * Math.sqrt(3) - 3, d = 1 - r
    return [{ x: 0, y: 0, r: 1, sign: -1 }, ...[90, 210, 330].map((a) => ({ x: d * Math.cos((a * Math.PI) / 180), y: d * Math.sin((a * Math.PI) / 180), r, sign: 1 }))]
  },
  '圆环链 N=5': () => ring(5), '圆环链 N=6': () => ring(6), '圆环链 N=8': () => ring(8),
  '三个分离圆': () => [0, 120, 240].map((a) => ({ x: 1.2 * Math.cos((a * Math.PI) / 180), y: 1.2 * Math.sin((a * Math.PI) / 180), r: 0.8, sign: 1 })),
  '四个分离圆': () => [0, 90, 180, 270].map((a) => ({ x: 1.3 * Math.cos((a * Math.PI) / 180), y: 1.3 * Math.sin((a * Math.PI) / 180), r: 0.85, sign: 1 })),
}
function ring(n) {
  const s = Math.sin(Math.PI / n), r = s / (1 + s), d = 1 - r
  return [{ x: 0, y: 0, r: 1, sign: -1 }, ...Array.from({ length: n }, (_, i) => ({ x: d * Math.cos((2 * Math.PI * i) / n), y: d * Math.sin((2 * Math.PI * i) / n), r, sign: 1 }))]
}
const items = []
;(async () => {
  try {
    const dev = await getDevice()
    const R = new Renderer(dev, cv, INVERSION)
    R.view = { cx: 0, cy: 0, scale: 2.6 }; R.iters = 40; R.mode = 1
    const draw = () => {
      R.setP(0, items.length)
      items.forEach((c, i) => R.setP(1 + i, c.x, c.y, c.r, c.sign))
      R.draw()
    }
    const ed = circleEditor(ov, cv, R.view, items, { onChange: draw, onSelect: () => info() })
    const load = (name) => {
      items.length = 0
      PRESETS[name]().forEach((c, i) => items.push({ ...c, color: COLS[i % 8], label: String(i + 1) }))
      ed.sel = -1; ed.draw(); draw()
    }
    attachPanZoom(cv, R.view, () => { ed.draw(); draw() })
    new ResizeObserver(() => { ed.draw(); draw() }).observe(cv)
    select(ctl, '预设', Object.keys(PRESETS).map((k) => [k, k]), 'Apollonian', load)
    select(ctl, '着色', [[0, '深度调色板'], [1, '按圆着色'], [2, '极限集发光'], [3, '教学:未完成变暗']], 1, (v) => { R.mode = +v; draw() })
    slider(ctl, '迭代上限', { min: 1, max: 120, step: 1, value: 40 }, (v) => { R.iters = v; draw() })
    const msg = document.createElement('p'); ctl.appendChild(msg)
    const info = () => { const c = items[ed.sel]; msg.textContent = c ? `选中圆 ${c.label}:${c.sign > 0 ? '内部反演' : '外部反演'}` : '点选一个圆可切换类型/删除' }
    button(ctl, '切换内/外反演', () => { const c = items[ed.sel]; if (c) { c.sign = -c.sign; info(); draw() } })
    button(ctl, '添加圆', () => { if (items.length < 8) { items.push({ x: R.view.cx, y: R.view.cy, r: 0.4, sign: 1, color: COLS[items.length % 8], label: String(items.length + 1) }); ed.draw(); draw() } })
    button(ctl, '删除选中', () => { if (ed.sel >= 0) { items.splice(ed.sel, 1); ed.sel = -1; items.forEach((c, i) => (c.label = String(i + 1))); ed.draw(); draw() } })
    button(ctl, '重置视图', () => { Object.assign(R.view, { cx: 0, cy: 0, scale: 2.6 }); ed.draw(); draw() })
    load('Apollonian'); info()
  } catch (e) { showError(cv, e) }
})()

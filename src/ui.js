// 小型 UI 工具:滑块 / 二维绘图 / 圆编辑器(SVG 覆盖层)
export const $ = (s, r = document) => r.querySelector(s)

// 在 parent 里加一行滑块,返回 {set(v), get()}
export function slider(parent, label, { min, max, step = 0.01, value }, onInput) {
  const row = document.createElement('div')
  row.className = parent.classList.contains('ctl') ? '' : 'row'
  row.style.display = 'flex'; row.style.alignItems = 'center'; row.style.gap = '8px'
  row.innerHTML = `<span style="min-width:64px;color:var(--dim)">${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${value}" style="flex:1;min-width:90px"><code style="min-width:48px;text-align:right"></code>`
  const inp = row.querySelector('input'), out = row.querySelector('code')
  const show = () => (out.textContent = (+inp.value).toFixed(step < 0.01 ? 3 : 2))
  inp.addEventListener('input', () => { show(); onInput(+inp.value) })
  show()
  parent.appendChild(row)
  return { get: () => +inp.value, set: (v) => { inp.value = v; show() } }
}

export function select(parent, label, options, value, onChange) {
  const row = document.createElement('div')
  row.style.cssText = 'display:flex;align-items:center;gap:8px;margin:4px 0'
  row.innerHTML = `<span style="min-width:64px;color:var(--dim)">${label}</span><select style="flex:1">${options.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>`
  const s = row.querySelector('select'); s.value = value
  s.addEventListener('change', () => onChange(s.value))
  parent.appendChild(row)
  return s
}

export function button(parent, text, onClick) {
  const b = document.createElement('button'); b.textContent = text
  b.style.margin = '2px 4px 2px 0'
  b.addEventListener('click', onClick); parent.appendChild(b); return b
}

// 二维画布(教学图用):复平面坐标 -> 像素
export class Plot2D {
  constructor(canvas, view = { cx: 0, cy: 0, scale: 4 }) {
    this.canvas = canvas; this.view = view; this.ctx = canvas.getContext('2d')
    this.resize()
  }
  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2)
    const w = Math.max(2, Math.round(this.canvas.clientWidth * dpr)), h = Math.max(2, Math.round(this.canvas.clientHeight * dpr))
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h }
    this.dpr = dpr
  }
  px(z) { const h = this.canvas.height; return [this.canvas.width / 2 + ((z[0] - this.view.cx) / this.view.scale) * h, h / 2 - ((z[1] - this.view.cy) / this.view.scale) * h] }
  z(ev) {
    const r = this.canvas.getBoundingClientRect()
    return [this.view.cx + ((ev.clientX - r.left - r.width / 2) / r.height) * this.view.scale, this.view.cy - ((ev.clientY - r.top - r.height / 2) / r.height) * this.view.scale]
  }
  len(l) { return (l / this.view.scale) * this.canvas.height }
  clear(bg = '#05060a') { this.resize(); const c = this.ctx; c.fillStyle = bg; c.fillRect(0, 0, this.canvas.width, this.canvas.height) }
  circle(c, r, color = '#fff', lw = 1.5, fill) {
    const [x, y] = this.px(c), R = this.len(r)
    if (R < 0.4 || R > 1e5 || !isFinite(R)) return
    const g = this.ctx; g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2)
    if (fill) { g.fillStyle = fill; g.fill() }
    g.strokeStyle = color; g.lineWidth = lw * this.dpr; g.stroke()
  }
  poly(pts, color = '#fff', lw = 1.5, close = false) {
    const g = this.ctx; g.beginPath()
    pts.forEach((p, i) => { const [x, y] = this.px(p); i ? g.lineTo(x, y) : g.moveTo(x, y) })
    if (close) g.closePath()
    g.strokeStyle = color; g.lineWidth = lw * this.dpr; g.stroke()
  }
  dot(z, r = 2, color = '#fff') { const [x, y] = this.px(z); const g = this.ctx; g.beginPath(); g.arc(x, y, r * this.dpr, 0, 6.2832); g.fillStyle = color; g.fill() }
  text(z, s, color = '#aab', size = 14) { const [x, y] = this.px(z); const g = this.ctx; g.fillStyle = color; g.font = `${size * this.dpr}px sans-serif`; g.fillText(s, x, y) }
  axes(color = '#1b2133') {
    const g = this.ctx; const [x0, y0] = this.px([0, 0]); g.strokeStyle = color; g.lineWidth = this.dpr
    g.beginPath(); g.moveTo(0, y0); g.lineTo(this.canvas.width, y0); g.moveTo(x0, 0); g.lineTo(x0, this.canvas.height); g.stroke()
  }
}

// 圆编辑器:在画布上方叠一层 SVG,拖动圆心移动、拖动小圆点改半径
// items: [{x,y,r,color,label}];view 与着色器使用的视图一致
export function circleEditor(svg, canvas, view, items, { onChange, onHover, onSelect } = {}) {
  const NS = 'http://www.w3.org/2000/svg'
  let sel = -1, drag = null
  const toPx = (x, y) => { const r = canvas.getBoundingClientRect(); return [r.width / 2 + ((x - view.cx) / view.scale) * r.height, r.height / 2 - ((y - view.cy) / view.scale) * r.height] }
  const toZ = (ev) => { const r = canvas.getBoundingClientRect(); return [view.cx + ((ev.clientX - r.left - r.width / 2) / r.height) * view.scale, view.cy - ((ev.clientY - r.top - r.height / 2) / r.height) * view.scale] }
  const len = (l) => { const r = canvas.getBoundingClientRect(); return (l / view.scale) * r.height }
  let extra = null // 额外折线(轨道轨迹)
  function draw() {
    svg.innerHTML = ''
    const rect = canvas.getBoundingClientRect()
    svg.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`)
    items.forEach((c, i) => {
      const [px, py] = toPx(c.x, c.y), R = len(c.r)
      const g = document.createElementNS(NS, 'g'); g.dataset.i = i
      g.innerHTML = `<circle cx="${px}" cy="${py}" r="${R}" fill="${c.color || '#fff'}" fill-opacity="${i === sel ? 0.12 : 0.04}" stroke="${c.color || '#fff'}" stroke-width="${i === sel ? 2.5 : 1.5}" stroke-opacity=".9" data-k="body" style="cursor:move"/>
        <circle cx="${px}" cy="${py}" r="3" fill="${c.color || '#fff'}"/>
        <circle cx="${px + R}" cy="${py}" r="6" fill="#0b0d12" stroke="${c.color || '#fff'}" stroke-width="2" data-k="handle" style="cursor:ew-resize"/>
        <text x="${px + 6}" y="${py - 6}" fill="${c.color || '#fff'}" font-size="13">${c.label || ''}</text>`
      svg.appendChild(g)
    })
    if (extra && extra.length > 1) {
      const p = document.createElementNS(NS, 'polyline')
      p.setAttribute('points', extra.map((z) => toPx(z[0], z[1]).join(',')).join(' '))
      p.setAttribute('fill', 'none'); p.setAttribute('stroke', '#fff'); p.setAttribute('stroke-width', 1.5); p.setAttribute('stroke-opacity', '.8')
      svg.appendChild(p)
      extra.forEach((z) => { const [x, y] = toPx(z[0], z[1]); const c = document.createElementNS(NS, 'circle'); c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', 3); c.setAttribute('fill', '#ffd27a'); svg.appendChild(c) })
    }
  }
  svg.addEventListener('pointerdown', (e) => {
    const t = e.target.closest('g'); if (!t || !t.dataset.i) return
    const i = +t.dataset.i, k = e.target.dataset.k
    if (!k) return
    sel = i; onSelect?.(i)
    const z = toZ(e); drag = { i, k, dx: items[i].x - z[0], dy: items[i].y - z[1] }
    svg.setPointerCapture(e.pointerId); e.stopPropagation(); draw()
  })
  svg.addEventListener('pointermove', (e) => {
    const z = toZ(e)
    if (drag) {
      const c = items[drag.i]
      if (drag.k === 'body') { c.x = z[0] + drag.dx; c.y = z[1] + drag.dy } else c.r = Math.max(0.03, Math.hypot(z[0] - c.x, z[1] - c.y))
      draw(); onChange?.(drag.i)
    } else onHover?.(z)
  })
  svg.addEventListener('pointerup', () => { drag = null })
  svg.style.pointerEvents = 'none'
  // 让空白处事件穿透到底下的画布(平移/缩放),只有圆本身接收事件
  svg.addEventListener('pointerenter', () => {})
  const style = document.createElement('style'); style.textContent = `svg.ed g{pointer-events:all} svg.ed circle[data-k]{pointer-events:all}`; document.head.appendChild(style)
  svg.classList.add('ed')
  draw()
  return { draw, get sel() { return sel }, set sel(v) { sel = v; draw() }, setExtra(p) { extra = p; draw() } }
}

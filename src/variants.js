import { getDevice, Renderer, showError } from './gpu.js'
import { SCHOTTKY, MASKIT, INVERSION, APOLLONIAN3D } from './shaders.js'
import { ChaosGame } from './chaos.js'
import { grandma } from './math.js'

const ringCircles = (n) => {
  const s = Math.sin(Math.PI / n), r = s / (1 + s), d = 1 - r
  return [[0, 0, 1, -1], ...Array.from({ length: n }, (_, i) => [d * Math.cos((2 * Math.PI * i) / n), d * Math.sin((2 * Math.PI * i) / n), r, 1])]
}
const apol = (() => { const r = 2 * Math.sqrt(3) - 3, d = 1 - r; return [[0, 0, 1, -1], ...[90, 210, 330].map((a) => [d * Math.cos((a * Math.PI) / 180), d * Math.sin((a * Math.PI) / 180), r, 1])] })()

const schottkyP = (R, pairs, th = [0, 0, 0]) => {
  R.setP(0, pairs.length)
  pairs.forEach((p, k) => { R.setP(1 + 2 * k, p[0], p[1], p[2], 0); R.setP(2 + 2 * k, p[3], p[4], p[5], th[k] || 0) })
}
const two = [[-1.1, 0, 0.77, 1.1, 0, 0.77], [0, -1.1, 0.77, 0, 1.1, 0.77]]
const three = [...two, [-1.9, 1.9, 0.45, 1.9, -1.9, 0.45]]
const invP = (R, cs) => { R.setP(0, cs.length); cs.forEach((c, i) => R.setP(1 + i, ...c)) }

// kind: 'fold' 正向/反向; 每个变种:{title, tag, desc, shader, setup(R), anim(R,t), link}
const V = [
  { t: 'Schottky · 两个生成元', tag: 'b', d: '四个互不相交的圆,两对。a 把圆 a 的外部映入圆 A 的内部。极限集是康托尘;颜色 = 最后一次折叠用的生成元。', sh: SCHOTTKY, link: 'play-schottky.html',
    setup: (R) => { R.view = { cx: 0, cy: 0, scale: 5.2 }; R.iters = 40; R.mode = 1; schottkyP(R, two) } },
  { t: 'Schottky · 扭转 θ', tag: 'b', d: 'ρ 带一个相位 e^{iθ},每个小圆内部整体旋转,极限集被拧成螺旋。θ 随时间变化。', sh: SCHOTTKY, link: 'play-schottky.html', anim: true,
    setup: (R) => { R.view = { cx: 0, cy: 0, scale: 5.2 }; R.iters = 40; R.mode = 0 }, frame: (R, t) => schottkyP(R, two, [Math.sin(t * 0.5) * 1.6, Math.cos(t * 0.4) * 1.6]) },
  { t: 'Schottky · 三个生成元', tag: 'b', d: '三对圆(六个圆),亏格 3 的 Schottky 群。分支更多,极限集更碎。', sh: SCHOTTKY, link: 'play-schottky.html',
    setup: (R) => { R.view = { cx: 0, cy: 0, scale: 5.6 }; R.iters = 40; R.mode = 1; schottkyP(R, three) } },
  { t: '深度调色板', tag: 'b', d: '同一个群,按“折叠了多少步才落进基本域”着色,调色板循环,等深线就是嵌套圆。', sh: SCHOTTKY, link: 'play-schottky.html',
    setup: (R) => { R.view = { cx: 0, cy: 0, scale: 5.2 }; R.iters = 60; R.mode = 0; schottkyP(R, [[-1.1, 0, 0.77, 1.1, 0, 0.77], [0, -1.1, 0.77, 0, 1.1, 0.77]], [0.6, -0.6]) } },
  { t: '极限集发光', tag: 'b', d: '迭代越久还没出去的像素越亮 —— 把“永远出不去”的极限集照亮。', sh: SCHOTTKY, link: 'play-schottky.html',
    setup: (R) => { R.view = { cx: 0, cy: 0, scale: 5.2 }; R.iters = 80; R.mode = 2; schottkyP(R, [[-1.1, 0, 0.77, 1.1, 0, 0.77], [0, -1.1, 0.77, 0, 1.1, 0.77]], [0.4, 0.4]) } },
  { t: 'Apollonian 反演群', tag: 'b', d: '四个两两相切的圆(一个外框),在它们之间反复反演,得到经典的 Apollonian 垫片。', sh: INVERSION, link: 'play-inversion.html',
    setup: (R) => { R.view = { cx: 0, cy: 0, scale: 2.3 }; R.iters = 40; R.mode = 1; invP(R, apol) } },
  { t: '圆环链 N=6', tag: 'b', d: '外框圆内一圈 N 个相切小圆(Steiner 链),反演群生成万花筒式的圆填充。', sh: INVERSION, link: 'play-inversion.html',
    setup: (R) => { R.view = { cx: 0, cy: 0, scale: 2.3 }; R.iters = 40; R.mode = 1; invP(R, ringCircles(6)) } },
  { t: '圆环链 N=9(深度着色)', tag: 'b', d: 'N 越大小圆越小、圆链越接近外框,图案变得更细密。', sh: INVERSION, link: 'play-inversion.html',
    setup: (R) => { R.view = { cx: 0, cy: 0, scale: 2.3 }; R.iters = 40; R.mode = 0; invP(R, ringCircles(9)) } },
  { t: 'Maskit · 双尖点', tag: 'b', d: 'T(z)=z+2 与 S(z)=1/z+c(a=2, b=0):两个抛物元。S 的两个等距圆相切 —— 尖点。', sh: MASKIT, link: 'play-maskit.html',
    setup: (R) => { R.view = { cx: 0, cy: 1, scale: 3.4 }; R.iters = 60; R.mode = 2; R.setP(0, 2, 0) } },
  { t: 'Maskit · 准 Fuchsian', tag: 'b', d: 'a=1.9, b=0.05:圆稍有重叠,极限集变成一条被拧出许多“龙头”的约当曲线。', sh: MASKIT, link: 'play-maskit.html',
    setup: (R) => { R.view = { cx: 0, cy: 1, scale: 3.4 }; R.iters = 80; R.mode = 2; R.setP(0, 1.9, 0.05) } },
  { t: 'Maskit · 参数巡游', tag: 'b', d: '沿参数平面缓慢移动 (a, b),看极限集连续变形。', sh: MASKIT, link: 'play-maskit.html', anim: true,
    setup: (R) => { R.view = { cx: 0, cy: 1, scale: 3.4 }; R.iters = 60; R.mode = 0 }, frame: (R, t) => R.setP(0, 1.92 + 0.08 * Math.sin(t * 0.6), 0.2 * Math.sin(t * 0.37)) },
  { t: '3D 球反演', tag: 'b', d: '把“盒折叠 + 球反演”推广到三维,距离估计 + 光线步进。球面在反演下仍是球面。', sh: APOLLONIAN3D, link: 'play-3d.html', anim: true,
    setup: (R) => {}, frame: (R, t) => R.setP(0, t * 0.25, 0.35, 3.2, 1.2) },
]

const grid = document.getElementById('grid')
;(async () => {
  try {
    const dev = await getDevice()
    const cards = V.map((v) => {
      const el = document.createElement('div'); el.className = 'card'
      el.innerHTML = `<canvas class="vc"></canvas><h3><span class="tag">${v.tag === 'b' ? '反向折叠' : '正向迭代'}</span><a href="./${v.link}">${v.t}</a></h3><p>${v.d}</p>`
      grid.appendChild(el)
      const R = new Renderer(dev, el.querySelector('canvas'), v.sh)
      v.setup(R)
      return { v, R }
    })
    // 正向迭代:混沌游戏(推文的做法)
    const chaosEl = document.createElement('div'); chaosEl.className = 'card'
    chaosEl.innerHTML = `<canvas class="vc"></canvas><h3><span class="tag b">正向迭代</span><a href="./play-chaos.html">混沌游戏 (Grandma 配方)</a></h3><p>推文的做法:粒子随机套用 A, B, A⁻¹, B⁻¹ 并累积直方图。这里 tr A = tr B = 1.8+0.4i。</p>`
    grid.insertBefore(chaosEl, grid.firstChild)
    const cg = new ChaosGame(dev, chaosEl.querySelector('canvas'), { particles: 32768, steps: 8 })
    cg.view.scale = 5
    cg.setGenerators(grandma([1.8, 0.4], [1.8, 0.4]))
    let cgFrames = 0
    const t0 = performance.now()
    ;(function loop(now) {
      const t = (now - t0) / 1000
      for (const { v, R } of cards) { if (v.anim) { v.frame?.(R, t); R.draw(t) } else if (!R.drawn || R.resized) { R.draw(t); R.drawn = true } }
      if (cgFrames < 240) { cg.step(2); cgFrames += 2 }
      requestAnimationFrame(loop)
    })(t0)
    addEventListener('resize', () => { cards.forEach(({ R }) => (R.drawn = false)); cg.reset(); cgFrames = 0 })
  } catch (e) { showError(grid, e) }
})()

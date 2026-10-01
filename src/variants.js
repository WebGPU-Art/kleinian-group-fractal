import { getDevice, Renderer, showError } from './gpu.js'
import { SCHOTTKY, MASKIT, INVERSION, APOLLONIAN3D, HYPERBOLIC } from './shaders.js'
import { ChaosGame } from './chaos.js'
import { grandma, conjugateInv } from './math.js'

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
const hyp = (R, p, q) => { const cq = Math.cos(Math.PI / q), sp = Math.sin(Math.PI / p); const d = cq / Math.sqrt(cq * cq - sp * sp); R.setP(0, p, q, d, Math.sqrt(d * d - 1)) }
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
  { t: '双曲镶嵌 {5,4}', tag: 'b', d: '三面镜子(两条直线 + 一个与单位圆正交的圆)生成的反射群,Fuchsian:极限集就是单位圆周。', sh: HYPERBOLIC, link: 'play-hyperbolic.html',
    setup: (R) => { R.view = { cx: 0, cy: 0, scale: 2.2 }; R.iters = 80; R.mode = 0; hyp(R, 5, 4) } },
  { t: '双曲镶嵌 {7,3} 彩色', tag: 'b', d: '每个顶点 3 个正七边形;颜色 = 折叠次数。把圆形边界附近放大,图案无限细分。', sh: HYPERBOLIC, link: 'play-hyperbolic.html',
    setup: (R) => { R.view = { cx: 0, cy: 0, scale: 2.2 }; R.iters = 80; R.mode = 1; hyp(R, 7, 3) } },
  { t: '双曲镶嵌 {3,8} 慢速旋转', tag: 'b', d: '{3,8}:每个顶点 8 个三角形。随时间放大并平移视角。', sh: HYPERBOLIC, link: 'play-hyperbolic.html', anim: true,
    setup: (R) => { R.view = { cx: 0, cy: 0, scale: 2.2 }; R.iters = 90; R.mode = 0; hyp(R, 3, 8) }, frame: (R, t) => { R.view.scale = 2.2 - 0.9 * (0.5 + 0.5 * Math.sin(t * 0.3)) } },
  { t: '3D 球反演', tag: 'b', d: '把“盒折叠 + 球反演”推广到三维,距离估计 + 光线步进。球面在反演下仍是球面。', sh: APOLLONIAN3D, link: 'play-3d.html', anim: true,
    setup: (R) => {}, frame: (R, t) => R.setP(0, 0.6 + t * 0.25, 0.35, 3.2, 1.2) },
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
    // 正向迭代:混沌游戏(推文的做法)—— 几条不同的“龙”
    const dragons = [
      ['龙 A', [2, 0.2], [2, 0.2], '推文的做法:粒子随机套用 A, B, A⁻¹, B⁻¹ 并累积直方图。tr A = tr B = 2+0.2i,尖点在顶部。'],
      ['龙 B(卷须更长)', [1.9, 0.3], [1.9, 0.3], 'tr A = tr B = 1.9+0.3i:极限集向左下方甩出一条长长的卷须。'],
      ['龙 C(接近圆)', [2.1, 0.15], [2.1, -0.15], 'tr A = 2.1+0.15i, tr B = 2.1−0.15i:接近 Fuchsian,曲线几乎是个圆,但细节处仍是分形。'],
      ['碎龙', [1.8, 0.5], [1.8, 0.5], '1.8+0.5i:离 Fuchsian 更远,极限集被撕成密集的碎块。'],
    ]
    const cgs = dragons.map(([name, ta, tb, desc]) => {
      const el = document.createElement('div'); el.className = 'card'
      el.innerHTML = `<canvas class="vc"></canvas><h3><span class="tag b">正向迭代</span><a href="./play-chaos.html">混沌游戏 · ${name}</a></h3><p>${desc}</p>`
      return { el, ta, tb }
    })
    cgs.slice().reverse().forEach(({ el }) => grid.insertBefore(el, grid.firstChild))
    const games = cgs.map(({ el, ta, tb }) => {
      const cg = new ChaosGame(dev, el.querySelector('canvas'), { particles: 32768, steps: 8 })
      Object.assign(cg.view, { cx: 0, cy: -0.8, scale: 3.2 })
      cg.setGenerators(conjugateInv(grandma(ta, tb), [0, -1]))
      return cg
    })
    let cgFrames = 0
    const t0 = performance.now()
    ;(function loop(now) {
      const t = (now - t0) / 1000
      for (const { v, R } of cards) { if (v.anim) { v.frame?.(R, t); R.draw(t) } else if (!R.drawn || R.resized) { R.draw(t); R.drawn = true } }
      if (cgFrames < 240) { games.forEach((g) => g.step(2)); cgFrames += 2 }
      requestAnimationFrame(loop)
    })(t0)
    addEventListener('resize', () => { cards.forEach(({ R }) => (R.drawn = false)); games.forEach((g) => g.reset()); cgFrames = 0 })
  } catch (e) { showError(grid, e) }
})()

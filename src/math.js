// 复数 [re, im] 与 Möbius(2x2 复矩阵)的小工具 —— CPU 端用于:构造生成元、画圆的像、追踪轨道
export const cadd = (a, b) => [a[0] + b[0], a[1] + b[1]]
export const csub = (a, b) => [a[0] - b[0], a[1] - b[1]]
export const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]]
export const cdiv = (a, b) => {
  const d = b[0] * b[0] + b[1] * b[1]
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]
}
export const csqrt = (a) => {
  const r = Math.hypot(a[0], a[1])
  const re = Math.sqrt((r + a[0]) / 2)
  const im = Math.sqrt(Math.max(0, (r - a[0]) / 2)) * (a[1] < 0 ? -1 : 1)
  return [re, im]
}
export const cscale = (a, s) => [a[0] * s, a[1] * s]

// 矩阵 m = [a,b,c,d],每项是复数。T(z) = (az+b)/(cz+d)
export const mmul = (m, n) => [
  cadd(cmul(m[0], n[0]), cmul(m[1], n[2])),
  cadd(cmul(m[0], n[1]), cmul(m[1], n[3])),
  cadd(cmul(m[2], n[0]), cmul(m[3], n[2])),
  cadd(cmul(m[2], n[1]), cmul(m[3], n[3])),
]
export const mdet = (m) => csub(cmul(m[0], m[3]), cmul(m[1], m[2]))
export const minv = (m) => [m[3], cscale(m[1], -1), cscale(m[2], -1), m[0]] // det=1 时的逆
export const mnorm = (m) => {
  const s = csqrt(mdet(m))
  return m.map((x) => cdiv(x, s)) // 归一化到 det = 1
}
export const mapply = (m, z) => cdiv(cadd(cmul(m[0], z), m[1]), cadd(cmul(m[2], z), m[3]))
export const ID = [[1, 0], [0, 0], [0, 0], [1, 0]]

// ---------- 生成元的几种构造方式 ----------
// 返回 [A, B, A⁻¹, B⁻¹] (下标 i 的逆是 (i+2)%4)

// 1) Grandma's recipe(Indra's Pearls):给定 tr A = ta, tr B = tb, 且 tr[A,B] = -2
//    tab 由 ta²+tb²+tab² = ta·tb·tab 解出 (取一个根)
export function grandma(ta, tb) {
  const ta2 = cmul(ta, ta), tb2 = cmul(tb, tb)
  const p = cmul(ta, tb)
  const disc = csub(cmul(p, p), cscale(cadd(ta2, tb2), 4))
  const tab = cscale(csub(p, csqrt(disc)), 0.5)
  const tab2 = cmul(tab, tab)
  const tb_tab = cdiv(tb, tab), ta_tab = cdiv(ta, tab)
  const A = [csub(ta, tb_tab), cdiv(ta, tab2), ta, tb_tab]
  const B = [csub(tb, ta_tab), cscale(cdiv(tb, tab2), -1), cscale(tb, -1), ta_tab]
  return withInverses(mnorm(A), mnorm(B))
}

// 2) Maskit 切片:T(z)=z+2, S(z)=1/z + c
export function maskit(c) {
  const T = [[1, 0], [2, 0], [0, 0], [1, 0]]
  const S = mnorm([c, [1, 0], [1, 0], [0, 0]])
  return withInverses(S, T)
}

// 3) Schottky:圆对 (ca,ra) → (cA,rA),g(z) = cA + ρ/(z-ca),ρ = ra·rA·e^{iθ}
//    g 把 "ca 圆的外部" 映为 "cA 圆的内部"
export function schottkyGen(ca, ra, cA, rA, theta = 0) {
  const rho = cscale([Math.cos(theta), Math.sin(theta)], ra * rA)
  // (cA·z + ρ - cA·ca)/(z - ca)
  return mnorm([cA, csub(rho, cmul(cA, ca)), [1, 0], cscale(ca, -1)])
}
export function schottky(pairs) {
  const g = pairs.map((p) => schottkyGen(p.ca, p.ra, p.cA, p.rA, p.theta || 0))
  return withInverses(g[0], g[1])
}

export function withInverses(A, B) { return [A, B, minv(A), minv(B)] }

// 圆 (c, r) 在 Möbius 下的像:采样边界点(像仍是圆,折线足够精确)
export function circleImage(m, c, r, n = 72) {
  const pts = []
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2
    pts.push(mapply(m, [c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)]))
  }
  return pts
}
// 由采样点估计圆心/半径(用 3 点外接圆),用来画真正的圆
export function circleFrom3(p, q, s) {
  const ax = p[0], ay = p[1], bx = q[0], by = q[1], cx = s[0], cy = s[1]
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by))
  if (Math.abs(d) < 1e-14) return null
  const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d
  const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d
  return { c: [ux, uy], r: Math.hypot(ax - ux, ay - uy) }
}
export function mobiusCircle(m, c, r) {
  const t = [0, 2.1, 4.2].map((a) => mapply(m, [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]))
  return circleFrom3(t[0], t[1], t[2])
}

// 词树:从 root 出发,逐层给出 (矩阵, 末字母, 首字母) —— 不允许 x 紧跟 x⁻¹
export function wordLevels(gens, depth) {
  const levels = [[{ m: ID, last: -1, first: -1 }]]
  for (let d = 1; d <= depth; d++) {
    const next = []
    for (const w of levels[d - 1]) {
      for (let g = 0; g < 4; g++) {
        if (w.last >= 0 && g === (w.last + 2) % 4) continue
        next.push({ m: mmul(w.m, gens[g]), last: g, first: w.first < 0 ? g : w.first })
      }
    }
    levels.push(next)
  }
  return levels
}

// Schottky 折叠的 CPU 镜像(与 shader 一致),返回路径,用于"追踪一个点是怎么被拉回基本域的"
export function schottkyFoldPath(z0, pairs, maxN = 40) {
  let z = z0
  const path = [z]
  for (let i = 0; i < maxN; i++) {
    let hit = false
    for (const p of pairs) {
      const rho = cscale([Math.cos(p.theta || 0), Math.sin(p.theta || 0)], p.ra * p.rA)
      let d = csub(z, p.ca)
      if (d[0] * d[0] + d[1] * d[1] < p.ra * p.ra) { z = cadd(p.cA, cdiv(rho, d)); hit = true; break }
      d = csub(z, p.cA)
      if (d[0] * d[0] + d[1] * d[1] < p.rA * p.rA) { z = cadd(p.ca, cdiv(rho, d)); hit = true; break }
    }
    if (!hit) break
    path.push(z)
  }
  return path
}

// 常用色板(与视频里 A/B/A⁻¹/B⁻¹ 的配色一致)
export const GEN_COLORS = ['#3fd3ff', '#a98bff', '#5b8cff', '#ff7fd0']

// 共轭:g' = C g C⁻¹。用 C(z) = 1/(z − z0) 把"尖点在 ∞ 的周期带"变成"尖点在 0 的闭曲线"
export function conjugateInv(gens, z0) {
  const C = mnorm([[0, 0], [1, 0], [1, 0], cscale(z0, -1)])
  const Ci = mnorm(minv(mnorm(C)))
  return gens.map((g) => mnorm(mmul(mmul(C, g), Ci)))
}

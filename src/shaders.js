// 各种全屏片元着色器(拼在 gpu.js 的 PRELUDE 之后)。入口统一叫 fs。

// 颜色模式(u.mode):
//   0 按折叠深度着色   1 按"最后用到的生成元"着色 + 深度明暗
//   2 极限集发光(深度越大越亮)  3 教学模式:只给"已被拉回基本域"的像素上色,没完成的变暗
const SHADE = /* wgsl */ `
fn shade(n: f32, last: i32, finished: bool, maxN: f32) -> vec3f {
  let m = i32(u.mode + 0.5);
  var col = vec3f(0.0);
  if (m == 0) {
    col = pal(n * 0.045) * (0.25 + 0.75 * exp(-n * 0.03));
    if (n < 0.5) { col = vec3f(0.03, 0.04, 0.08); }
    if (!finished) { col = vec3f(0.0); }
  } else if (m == 1) {
    var base = vec3f(0.10, 0.12, 0.2);
    if (last >= 0) { base = genColor(last % 4); }
    col = base * (0.18 + 0.82 * exp(-n * 0.16));
    if (!finished) { col = vec3f(1.0); }
  } else if (m == 2) {
    let g = 1.0 - exp(-n * 0.1);
    col = mix(vec3f(0.02, 0.03, 0.07), vec3f(0.55, 0.85, 1.0), g);
    if (!finished) { col = vec3f(1.0, 0.95, 0.8); }
  } else {
    if (!finished) { col = vec3f(0.07); }
    else if (last < 0) { col = vec3f(0.9); }
    else { col = genColor(last % 4) * (0.45 + 0.55 * exp(-n * 0.25)); }
  }
  return col;
}
`

// ---------- Schottky(圆对 + 可选扭转),exact Möbius ----------
// p[0].x = 圆对个数 (1..3);p[1+2k] = (ca.xy, ra, 0);p[2+2k] = (cA.xy, rA, θ)
// 规则:点落进 a 圆 -> g(z)=cA+ρ/(z-ca) 把它推到 A 圆外;落进 A 圆 -> g⁻¹(z)=ca+ρ/(z-cA)
export const SCHOTTKY = SHADE + /* wgsl */ `
@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  var z = toZ(pos.xy);
  let np = i32(u.p[0].x + 0.5);
  let maxN = i32(u.iters + 0.5);
  var n = 0.0; var last = -1; var done = false;
  for (var i = 0; i < maxN; i++) {
    var hit = false;
    for (var k = 0; k < 3; k++) {
      if (k >= np) { break; }
      let pa = u.p[1 + 2 * k]; let pA = u.p[2 + 2 * k];
      let rho = pa.z * pA.z * vec2f(cos(pA.w), sin(pA.w));
      let da = z - pa.xy;
      if (dot(da, da) < pa.z * pa.z) { z = pA.xy + cdiv(rho, da); hit = true; last = 2 * k; break; }
      let dA = z - pA.xy;
      if (dot(dA, dA) < pA.z * pA.z) { z = pa.xy + cdiv(rho, dA); hit = true; last = 2 * k + 1; break; }
    }
    if (!hit) { done = true; break; }
    n += 1.0;
  }
  // 循环刚好用完时,检查是否其实已经在基本域里
  if (!done) {
    var inside = false;
    for (var k = 0; k < 3; k++) {
      if (k >= np) { break; }
      let pa = u.p[1 + 2 * k]; let pA = u.p[2 + 2 * k];
      if (distance(z, pa.xy) < pa.z || distance(z, pA.xy) < pA.z) { inside = true; }
    }
    done = !inside;
  }
  return vec4f(shade(n, last, done, f32(maxN)), 1.0);
}
`

// ---------- Maskit 切片:T(z)=z+2, S(z)=1/z + c,c=(-b, a) ----------
// p[0].xy = (a, b);用对称元 R(z)=c-z 折叠 + 带状域 0<y<a 判定(Jos Leys / Knighty 的做法)
export const MASKIT = SHADE + /* wgsl */ `
@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  var z = toZ(pos.xy);
  let a = u.p[0].x; let b = u.p[0].y;
  let c = vec2f(-b, a);
  let k = b / a;
  let maxN = i32(u.iters + 0.5);
  var n = 0.0; var done = false; var last = -1;
  for (var i = 0; i < maxN; i++) {
    // T:把 z 平移回宽度为 2 的带内(沿剪切方向)
    z.x += k * z.y;
    z.x -= 2.0 * floor(0.5 * z.x + 0.5);
    z.x -= k * z.y;
    // R:椭圆对合 z -> c - z,把"中线以上"折到下面
    if (z.y >= a * (0.5 + 0.2 * sin(3.14159265 * (z.x + b * 0.5 / a)))) { z = c - z; last = 0; } else { last = 1; }
    // 已经在 S 的等距圆(单位圆)之外 -> 落在基本域内,停止
    if (dot(z, z) >= 1.0) { done = true; break; }
    // S:z -> 1/z + c(把单位圆内部映到 c 为心的圆外部)
    z = vec2f(z.x, -z.y) / dot(z, z) + c;
    n += 1.0;
  }
  return vec4f(shade(n, last, done, f32(maxN)), 1.0);
}
`

// ---------- 反演群(反射群):每个圆 = (cx, cy, r, sign) ----------
// sign>0:点在圆内就反演;sign<0:点在圆外才反演(用来做 "外框" 圆)
// p[0].x = 圆个数(<=8);p[1+i] = 圆 i
export const INVERSION = SHADE + /* wgsl */ `
@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  var z = toZ(pos.xy);
  let nc = i32(u.p[0].x + 0.5);
  let maxN = i32(u.iters + 0.5);
  var n = 0.0; var last = -1; var done = false;
  for (var i = 0; i < maxN; i++) {
    var hit = false;
    for (var k = 0; k < 8; k++) {
      if (k >= nc) { break; }
      let c = u.p[1 + k];
      let d = z - c.xy;
      let d2 = dot(d, d);
      let inside = d2 < c.z * c.z;
      if ((c.w > 0.0 && inside) || (c.w < 0.0 && !inside)) {
        z = c.xy + d * (c.z * c.z / max(d2, 1e-12));
        hit = true; last = k; break;
      }
    }
    if (!hit) { done = true; break; }
    n += 1.0;
  }
  return vec4f(shade(n, last, done, f32(maxN)), 1.0);
}
`

// ---------- 教学用:Möbius 变换作用在"圆盘网格"上 ----------
// p[0] = 矩阵 (a.xy, b.xy)  p[1] = (c.xy, d.xy);u.mode: 0=原图 1=变换后的图
// 变换后:对每个像素 z,取 T⁻¹(z) 去采样原图
export const MOBIUS_DEMO = /* wgsl */ `
fn pattern(z: vec2f) -> vec3f {
  // 同心圆环 + 直线网格,颜色随位置变化,便于看出 "圆变圆、线变圆"
  let g = abs(fract(z + 0.5) - 0.5);
  let line = 1.0 - smoothstep(0.0, 0.025 * u.scale / 4.0 + 0.004, min(g.x, g.y));
  let cell = floor(z + 0.5);
  var col = vec3f(0.05, 0.07, 0.14) + 0.07 * pal(0.13 * (cell.x + 2.0 * cell.y)) ;
  col = mix(col, vec3f(0.35, 0.8, 1.0), line * 0.9);
  // 单位圆(黄)与一个小圆(青)
  let r1 = abs(length(z - vec2f(0.0, 0.0)) - 1.0);
  col = mix(col, vec3f(1.0, 0.75, 0.3), 1.0 - smoothstep(0.0, 0.03 * u.scale / 4.0 + 0.003, r1));
  let r2 = abs(length(z - vec2f(1.6, 0.8)) - 0.45);
  col = mix(col, vec3f(1.0, 0.45, 0.8), 1.0 - smoothstep(0.0, 0.03 * u.scale / 4.0 + 0.003, r2));
  return col;
}
@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  var z = toZ(pos.xy);
  if (u.mode > 0.5) {
    let a = u.p[0].xy; let b = u.p[0].zw; let c = u.p[1].xy; let d = u.p[1].zw;
    // T⁻¹(z) = (d z - b)/(-c z + a)
    z = cdiv(cmul(d, z) - b, a - cmul(c, z));
  }
  return vec4f(pattern(z), 1.0);
}
`

// ---------- 3D:球反演 + 盒折叠 的 Apollonian 分形(iq 风格距离估计 + 光线步进) ----------
// p[0] = (camYaw, camPitch, camDist, scaleK)
export const APOLLONIAN3D = /* wgsl */ `
fn de(p0: vec3f) -> vec2f {
  var p = p0; var s = 1.0; var orbit = 0.0;
  let kk = u.p[0].w;
  for (var i = 0; i < 7; i++) {
    p = -1.0 + 2.0 * fract(0.5 * p + 0.5);       // 盒折叠:把空间周期性折回 [-1,1]^3
    let r2 = dot(p, p);
    let k = kk / r2;                              // 球反演(缩放 kk)
    p *= k; s *= k;
    orbit += r2 * 0.1;
  }
  return vec2f(0.25 * abs(p.y) / s, orbit);
}
fn calcN(p: vec3f) -> vec3f {
  let e = vec2f(0.0007, 0.0);
  return normalize(vec3f(de(p + e.xyy).x - de(p - e.xyy).x, de(p + e.yxy).x - de(p - e.yxy).x, de(p + e.yyx).x - de(p - e.yyx).x));
}
@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let uv = (pos.xy - 0.5 * u.res) / u.res.y;
  let yaw = u.p[0].x; let pit = u.p[0].y; let dist = u.p[0].z;
  let ro = vec3f(cos(pit) * sin(yaw), sin(pit), cos(pit) * cos(yaw)) * dist + vec3f(0.0, 0.0, 0.0);
  let fw = normalize(-ro);
  let rt = normalize(cross(fw, vec3f(0.0, 1.0, 0.0)));
  let up = cross(rt, fw);
  let rd = normalize(fw * 1.6 + rt * uv.x - up * uv.y);
  var t = 0.0; var hit = false; var orb = 0.0; var steps = 0.0;
  for (var i = 0; i < 160; i++) {
    let r = de(ro + rd * t);
    if (r.x < 0.0006 * t) { hit = true; orb = r.y; break; }
    t += r.x;
    steps += 1.0;
    if (t > 12.0) { break; }
  }
  var col = vec3f(0.02, 0.03, 0.07) + 0.15 * vec3f(0.3, 0.4, 0.8) * (1.0 - length(uv));
  if (hit) {
    let p = ro + rd * t;
    let n = calcN(p);
    let l = normalize(vec3f(0.6, 0.8, 0.4));
    let dif = clamp(dot(n, l), 0.0, 1.0);
    let ao = 1.0 - steps / 160.0;
    let base = 0.5 + 0.5 * cos(6.28318 * (vec3f(orb * 0.55) + vec3f(0.0, 0.2, 0.45)));
    col = base * (0.15 + 0.9 * dif) * (0.35 + ao * ao * 1.2);
    col += 0.25 * pow(clamp(dot(reflect(rd, n), l), 0.0, 1.0), 16.0);
    col = mix(col, vec3f(0.02, 0.03, 0.07), 1.0 - exp(-0.015 * t * t));
  }
  return vec4f(pow(col, vec3f(0.8)), 1.0);
}
`

// ---------- 双曲镶嵌 {p, q}:三角形群 (p, q, 2) 的反射群 ----------
// 基本三角形:x 轴、过原点倾角 π/p 的直线、圆心 (d,0) 半径 r 的圆(与单位圆正交)
// p[0] = (p, q, d, r);u.mode: 0 = 奇偶双色  1 = 按折叠次数彩色
export const HYPERBOLIC = /* wgsl */ `
@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  var z = toZ(pos.xy);
  let z0 = z;
  let P = u.p[0].x; let d = u.p[0].z; let r = u.p[0].w;
  if (dot(z, z) >= 1.0) {
    let ring = smoothstep(0.02 * u.scale / 2.5, 0.0, abs(length(z) - 1.0));
    return vec4f(mix(vec3f(0.02, 0.03, 0.07), vec3f(0.9, 0.8, 0.5), ring), 1.0);
  }
  let ang = 3.14159265 / P;
  let nrm = vec2f(-sin(ang), cos(ang));
  let cc = vec2f(d, 0.0);
  var n = 0.0;
  let maxN = i32(u.iters + 0.5);
  for (var i = 0; i < maxN; i++) {
    var ch = false;
    if (z.y < 0.0) { z.y = -z.y; n += 1.0; ch = true; }
    let s = dot(z, nrm);
    if (s > 0.0) { z -= 2.0 * s * nrm; n += 1.0; ch = true; }
    let dz = z - cc; let d2 = dot(dz, dz);
    if (d2 < r * r) { z = cc + dz * (r * r / d2); n += 1.0; ch = true; }
    if (!ch) { break; }
  }
  // 三角形三边的双曲距离近似(欧氏距离 / 共形因子)
  let k = max(1e-4, 1.0 - dot(z, z));
  let e1 = abs(z.y);
  let e2 = abs(dot(z, nrm));
  let e3 = abs(length(z - cc) - r);
  let e = min(e1, min(e2, e3)) / k;
  let par = fract(n * 0.5) * 2.0;
  var base = mix(vec3f(0.95, 0.55, 0.25), vec3f(0.2, 0.55, 0.95), par);
  if (u.mode > 0.5) { base = 0.5 + 0.5 * cos(6.28318 * (vec3f(n * 0.045) + vec3f(0.0, 0.33, 0.67))); }
  // 靠近顶点 (原点附近的 p 角点) 加亮,更像 Escher 的块状效果
  let glow = 0.75 + 0.25 * exp(-length(z) * 6.0);
  var col = base * glow;
  col = mix(col * 0.1, col, smoothstep(0.0, 0.05, e));
  // 靠近单位圆时淡出,强调"极限集 = 圆周"
  col *= smoothstep(0.0, 0.03, 1.0 - length(z0));
  return vec4f(col, 1.0);
}
`

# Kleinian 群分形 · WebGPU

> A simple transformation in the complex plane can generate astonishing geometry.

灵感来自一段动画:两个 Möbius 变换 `z ↦ (az + b)/(cz + d)` 及其逆,反复迭代,点的轨道累积成 Kleinian 群的**极限集**;因为 Möbius 变换保圆,所以处处是圆球状的结构。

本项目用 **WebGPU**(compute + fragment 着色器)把这件事实时画出来,并配有分步讲解、变种画廊和可交互 Demo。

## 页面

| 页面 | 内容 |
| --- | --- |
| `index.html` | 导航首页 |
| `tutorial.html` | **原理讲解**(6 步,每步有图):Möbius 保圆 → 生成元与 1→4→12 圆树 → 随机轨道 → 混沌游戏累积 → 逐像素反向折叠 → Maskit 两种算法对照 |
| `variants.html` | **玩法变种**画廊(12 格实时运行):Schottky(两对 / 扭转 / 三对)、Apollonian 反演群、圆环链、Maskit(双尖点 / 准 Fuchsian / 参数巡游)、混沌游戏、3D 球反演 |
| `play-chaos.html` | 混沌游戏:拖动 tr A、tr B(Grandma 配方)或 Maskit 参数,10 万级粒子累积极限集 |
| `play-schottky.html` | Schottky 编辑器:拖动圆对、改半径与扭转角,悬停显示点被折叠的轨迹 |
| `play-maskit.html` | Maskit 参数探索:参数板拖点、一键巡游 |
| `play-inversion.html` | 圆反演群:自己摆圆,Apollonian / 圆环链预设 |
| `play-3d.html` | 3D 球反演:盒折叠 + 球反演的光线步进 |

## 两条算法路线

**正向迭代(混沌游戏)** — `src/chaos.js`
粒子随机套用 A、B、A⁻¹、B⁻¹(不允许 x 紧接 x⁻¹),落点用 `atomicAdd` 累积到直方图,再 log 色调映射;颜色 = 最近用的生成元。任何由矩阵给出的群都能画(Grandma 配方、Maskit……)。缺点是尖点附近采样稀疏。

**反向折叠(逐像素)** — `src/shaders.js`
对每个像素 z,用群元素把它拉回基本域并数步数,极限集上的点永远拉不回去。
- Schottky:圆对 `(a, A)` 给出 `g(z) = cA + ρ/(z − ca)`,`ρ = ra·rA·e^{iθ}`,把圆 a 外部映到圆 A 内部。
- Maskit:`T(z)=z+2`,`S(z)=1/z+c`,配合椭圆对合 `R(z)=c−z` 折叠。
- 反演群:点在圆内就反演到圆外(外框圆用"圆外反演")。

## 代码结构

```
src/math.js       复数 / Möbius 矩阵、Grandma / Maskit / Schottky 生成元、词树
src/gpu.js        WebGPU 设备、全屏着色器渲染器、平移缩放、导航栏
src/chaos.js      混沌游戏(compute + 渲染)
src/shaders.js    折叠着色器(Schottky / Maskit / 反演)、Möbius 演示、3D 球反演
src/ui.js         滑块、Canvas2D 绘图、SVG 圆编辑器
src/tutorial.js   讲解页逻辑
src/variants.js   变种画廊
src/play-*.js     各交互 Demo
```

## 运行

需要支持 WebGPU 的浏览器(新版 Chrome / Edge)。

```bash
corepack enable   # 让 packageManager 指定的 yarn 版本生效
yarn
yarn dev          # http://localhost:5173
yarn build        # 产物在 dist/
```

## 部署

`.github/workflows/upload.yaml`:push 到 `main` 或同仓库 PR 时,以 `VITE_BASE_URL=https://cos-sh.tiye.me/<owner>/<repo>/` 构建(PR 加 `pr/`),上传静态资源到腾讯云 COS,`main` 再 rsync 到服务器。需要仓库 secrets:`COS_BUCKET`、`COS_SECRET_ID`、`COS_SECRET_KEY`、`rsync_private_key`。

> 注意:CI 固定 yarn 4.12.0,`yarn.lock` 头部为 `version: 8`。请用 `corepack enable` 后的 yarn 安装,否则较新版本的 yarn 会把锁文件改写成 `version: 10`,导致 `yarn install --immutable` 失败。

## 参考

- Indra's Pearls(Mumford, Series, Wright):Grandma 配方、Maskit 切片
- Jos Leys / Knighty 的 Kleinian 折叠着色器
- Apollonian 3D 分形(Inigo Quilez 的距离估计写法)

<!-- README.md -->
<div align="center">

# 📥 ComfyUI-Suski-Asset-Triage
### ComfyUI 资产审片与转存流管理器 (Asset Triage)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![ComfyUI Frontend](https://img.shields.io/badge/ComfyUI-Modern%20%26%20Legacy%20UI-green.svg)](https://github.com/comfyanonymous/ComfyUI)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-orange.svg)](#全平台兼容性)
[![Zero Intrusion](https://img.shields.io/badge/Design-Zero--Intrusion-success.svg)](#核心定位与设计原则)

*审美与跑图彻底解耦。审一张、少一张，实现灵感收件箱清零 (Inbox Zero)。*

---

</div>

## 💡 核心定位与设计原则

* **零侵入（Zero-Intrusion）：** 画布无任何专属自定义节点，直接静默读取原生临时预览目录（`temp/`）图片，不破坏任何现有工作流。
* **静默就绪（Zero-Latency Pre-computation）：** 后台事件驱动拦截，图片落盘瞬间多线程自动生成轻量 WebP 缩略图与元数据缓存，前端面板秒级渲染（0ms 感知延迟）。
* **审美解耦（Asynchronous）：** 跑图与选图分离，支持任务连续堆叠批跑，空闲时集中批阅，告别跑一张看一张的注意力碎片化。
* **收件箱清零（Inbox Zero）：** 审一张、少一张；转存即移出（Move），废弃即销毁（Remove），连带物理清理关联缓存，彻底杜绝磁盘垃圾堆积。

---

## ✨ 核心特性

### 1. 顶栏常驻入口与动态通知 (Top-bar Widget)
* **双模自适应挂载：** 完美兼容 ComfyUI 最新版顶栏（Topbar）与经典悬浮菜单（Menu）。
* **动态呼吸红点：** 待审队列计数响应式同步；新图预处理落盘时触发 **Pop Bounce 弹性动画**；队列清空自动隐藏。

### 2. 模式 A：极简总览模式 (Pure Visual Wall)
* **纵向瀑布流（Vertical Masonry）：** 适合高效率扫视。视口虚拟化与 `IntersectionObserver` 懒加载结合，百张资产丝滑滚动。
* **水平高沉浸胶卷流（Horizontal Filmstrip）：** 单行撑满容器，独创滚轮纵横映射（Wheel Hijack），垂直滚轮平滑驱动横向无限漫游。
* **纯视觉微交互：** 图片零文本干扰铺满，单击主体快速勾选，悬浮显露右上角 `[⤢]` 直达精审。

### 3. 模式 B：深度精审模式 (Deep Inspection)
* **高保真看图画布：** 基于鼠标指针轴心的无级平滑滚轮缩放、抓手拖拽平移、双击一键切换 1:1 像素点对点质检。
* **相邻图片静默预加载：** 精审第 N 张图时，后台自动预拉取 N-1 与 N+1 张原生临时大图，左右快速切图 0ms 等待。
* **参数侧边栏：** 启发式图遍历提取主 Checkpoint 模型、采样器、调度器、CFG、步数、种子与生效 LoRA 列表，支持正反向提示词一键复制。

### 4. 灵活转存与安全机制 (Export & Safeguard)
* **乐观 UI（Optimistic UI）：** 点击转存立即从视图剥离条目，后台异步执行格式重编码并连带清理缓存，失败支持一键安全回滚。
* **丰富占位符（Tokens）：** 支持 `%date%`、`%time%`、`%model%`、`%sampler%`、`%seed%`、`%category%`、`%count%`（并发安全自增）等动态命名与路径组织。
* **多格式与元数据封装：** 支持免转码 PNG 直移，以及 WebP/JPEG 转码并自动注入标准 `EXIF:UserComment` 或 `XMP`。

---

## ⌨️ 快捷键拓扑映射表

工作台打开时全局生效，不污染 ComfyUI 画布：

| 快捷键 | 作用域 | 功能行为 |
| :--- | :--- | :--- |
| `Esc` | 全局 | 退出深度精审返回总览 / 关闭审片工作台 |
| `X` | 精审模式 | 快速切换当前图的标记/勾选状态 |
| `Enter` / `Space` | 全局 | 执行转存（精审模式单张转存；总览模式批量转存） |
| `Delete` / `Backspace` | 全局 | 物理废弃删除图片及对应缓存 |
| `←` / `→` | 精审模式 | 快速切换查看上一张 / 下一张（预加载） |
| `Ctrl + A` | 总览模式 | 全选当前待审列表所有图片 |
| `Ctrl + I` | 总览模式 | 反选图片 |

---

## 📦 安装说明

### 方法 1：通过 Git 克隆（推荐）
进入 ComfyUI 根目录下的 `custom_nodes` 文件夹：
```bash
cd ComfyUI/custom_nodes/
git clone https://github.com/Suski/ComfyUI-Suski-Asset-Triage.git
```
重启 ComfyUI 即可。

### 方法 2：手动下载
1. 点击 GitHub 仓库右上角 `Code` -> `Download ZIP`；
2. 解压至 `ComfyUI/custom_nodes/ComfyUI-Suski-Asset-Triage` 目录下；
3. 重启 ComfyUI。

*依赖说明：仅依赖 Python 标准库以及 ComfyUI 原生运行环境自带的 `Pillow`，无需安装任何额外第三方重型扩展包。*

---

## 🖥 全平台兼容性

* **Windows：** 所有文件读取统一使用内存 `io.BytesIO` 中转，从根源规避了 `PermissionError: [WinError 32]` 文件句柄占用冲突。
* **macOS / Linux：** 遵循 POSIX 路径规范，适配 macOS 触控板平滑滑动及不同系统下的滚轮纵横映射。
* **路径与跨盘：** 内置 `shutil.move` 跨盘容错以及防路径穿越（Directory Traversal）过滤。

---

## 📄 开源许可

本项目基于 [MIT License](LICENSE) 开源发布。
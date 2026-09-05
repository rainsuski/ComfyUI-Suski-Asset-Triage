# ComfyUI-Suski-Asset-Triage

<div align="center">

---

## 💡 核心定位与设计原则

* **零侵入（Zero-Intrusion）：** 画布无需任何专属节点。默认静默读取原生临时预览目录（`temp/`），或自由配置自定义暂存目录，配合原生保存节点即可直接待审。
* **双模仓库，选择由你（Flexible Staging）：**
  * **临时审片（默认）：** 留空即审阅 `temp/`，不占额外磁盘，审完/弃用即清理；
  * **持久化审片：** 指定暂存目录（如 `staging` 或绝对路径），配合原生 `Save Image` 节点落盘，跑图与审片彻底解耦。
* **双模解析，动静兼备（Dual-Engine Lineage）：**
  * **复杂多阶段优先（DataflowProbe）：** 优先探测多阶段时序血统探针元数据，完美捕获运行时动态计算出的真实参数；
  * **原生拓扑无感兜底（Native Fallback）：** 未命中动态血统时，自动无缝降级为标准原生静态 DAG 拓扑回溯。
* **收件箱清零（Inbox Zero）：** 审一张、少一张；转存即移出（Move/转码），废弃即物理销毁（Remove），连带清理关联预处理缓存，杜绝磁盘堆积。

---

## ✨ 核心特性

### 1. 顶栏常驻入口与动态通知 (Top-bar Widget)

* **双模自适应挂载：** 完美兼容 ComfyUI 最新版顶栏（Topbar）与经典悬浮菜单（Menu）。
* **动态呼吸红点：** 待审队列计数响应式同步；新图预处理落盘时触发 **Pop Bounce 弹性动画**；队列清空自动隐藏。

### 2. 模式 A：极简总览模式 (Pure Visual Wall)

* **纵向瀑布流（Vertical Masonry）：** 适合高效率扫视。视口虚拟化与 `IntersectionObserver` 懒加载结合，百张资产丝滑滚动。
* **水平高沉浸胶卷流（Horizontal Filmstrip）：** 单行撑满容器，独创滚轮纵横映射（Wheel Hijack），垂直滚轮平滑驱动横向无限漫游。

### 3. 模式 B：深度精审模式 (Deep Inspection)

* **高保真看图画布：** 基于鼠标指针轴心的无级平滑滚轮缩放、抓手拖拽平移、双击一键切换 1:1 像素点对点质检。
* **相邻图片静默预加载：** 精审第 N 张图时，后台自动预拉取前一张与后一张大图，左右快速切图 0ms 等待；支持毫秒级时间戳防缓存。
* **极简流线型阶段指示器：**
  * 一卡一阶段独立查看，点击箭头或圆点瞬间切换各阶段专属的模型、采样器、提示词与 LoRA。

### 4. 灵活转存与安全机制 (Export & Safeguard)

* **乐观 UI（Optimistic UI）：** 点击转存立即从视图剥离条目，后台异步执行并连带清理缓存，失败支持安全回滚。
* **丰富占位符（Tokens）：** 支持 `%date%`、`%time%`、`%model%`、`%sampler%`、`%scheduler%`、`%seed%`、`%cfg%`、`%steps%`、`%count%`（并发安全自增）等动态命名与多级目录组织。
* **多格式与元数据封装：** 支持免转码 PNG 直出，以及 WebP / JPEG 自定义画质转码；转存为 PNG 时自动完整继承回写多阶段血统元数据。

---

## 🔀 复杂工作流支持方案 (ComfyUI-Suski-Dataflow-Probe 对接)

对于包含 **Base+Refiner 分步精修、动态 Switch 旁路分支、子图嵌套 (Group Node) 或动态 Wildcard 抽卡** 等复杂场景，原生的静态拓扑抓取往往无法获取运行时真实计算的动态参数。

本插件已内置对 **[ComfyUI-Suski-Dataflow-Probe](https://github.com/rainsuski/ComfyUI-Suski-Dataflow-Probe)** 规范的原生双向对接：

```text
[生成时]
ComfyUI-Suski-Dataflow-Probe (探针与聚合) ──注入──> PNG extra_pnginfo (dataflow_lineage)
                                                      │
                                                      ▼
[审片时]
Asset Triage 解析调度器 ──优先命中──> 阶段一 / 阶段二 ... 独立渲染 & 占位符精准映射
         │ (未命中时)
         └──────降级──────> 原生 KSampler 静态拓扑回溯
```

### ⚙️ 核心配置项解析 (偏好设置面板)

在审片管理器右上角打开 **设置 (⚙)** 面板，可对复杂工作流适配进行精细化调节：

| 配置项 | 默认值 | 详细解析与指导 |
| :--- | :--- | :--- |
| **DataflowProbe 血统探针注入键名 (`lineage_key`)** | `dataflow_lineage` | 对应探针节点（`MetaAggregatorInjector`）写入 `extra_pnginfo` 的键名。Asset Triage 会优先检索该字段以提取结构化时序账单。若你在探针节点中配置了专属的自定义注入键名，在此处填入相同键名即可无缝匹配。 |
| **转存命名默认采样阶段 (`lineage_export_stage`)** | `0` | 当资产包含多个管线阶段时，转存命名模板（如 `%model%`、`%seed%`、`%sampler%` 等）优先提取哪个阶段的生成参数。填 `0` 代表提取第 1 阶段（Base 阶段）；若希望转存文件名记录精修阶段（Refiner），可配置为 `1`。 |
| **审阅仓库暂存目录 (`staging_dir`)** | 留空 | **留空**：审阅原生 `temp/` 临时预览图；**填值**（如 `staging` 或绝对路径）：配合原生 `Save Image` 节点保存至该目录即可进入待审列表，实现持久化审片。 |
| **默认启动视图 (`default_view`)** | `masonry` | 打开审片工作台时的默认模式：纵向瀑布流 (`masonry`) 或水平胶卷流 (`filmstrip`)。 |
| **预处理缩略图长边规格 (`thumb_max_edge`)** | `512` | 预生成 WebP 缩略图长边尺寸。可选 `512`（极速省显存）、`768`（高清）、或原图尺寸。 |
| **转存默认输出格式 (`default_format`)** | `PNG` | 转存时的默认目标文件格式（`PNG` 无损保留完整工作流与血统；`WEBP` / `JPEG` 注入 EXIF UserComment）。 |
| **废弃二次确认 (`confirm_delete`)** | `true` | 在点击“废弃”或按下 `Delete` 物理销毁文件前是否弹出二次确认弹窗。 |

---

## ⌨️ 快捷键拓扑映射表

工作台打开时全局生效，不污染 ComfyUI 画布：

| 快捷键 | 作用域 | 功能行为 |
| :--- | :--- | :--- |
| `Esc` | 全局 | 退出深度精审返回总览 / 关闭审片工作台 |
| `X` | 精审模式 | 快速切换当前图的选择/勾选状态（零抖动点亮） |
| `Enter` / `Space` | 全局 | 执行转存（精审模式转存当前单张；总览模式批量转存选中项） |
| `Delete` / `Backspace` | 全局 | 物理废弃删除图片及对应缓存 |
| `←` / `→` | 精审模式 | 快速切换查看上一张 / 下一张（预加载大图） |
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

*依赖说明：仅依赖 Python 标准库以及 ComfyUI 原生自带环境，无需安装任何额外第三方重型扩展包。*

---

## 🖥 全平台兼容性

* **Windows：** 所有文件读取统一使用内存 `io.BytesIO` 中转，从根源规避 `PermissionError: [WinError 32]` 文件句柄占用冲突。
* **macOS / Linux：** 遵循 POSIX 路径规范，适配 macOS 触控板平滑手势及滚轮纵横平滑映射。
* **跨盘安全保障：** 原图转存与销毁内置原子级操作及防路径穿越（Directory Traversal）过滤。

---

## 📄 开源许可

本项目基于 [MIT License](LICENSE) 开源发布。

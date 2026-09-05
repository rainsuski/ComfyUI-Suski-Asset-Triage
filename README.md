<!-- README.md -->

<div align="center">

---

## 💡 核心定位与设计原则

* **零侵入（Zero-Intrusion）：** 画布无需任何专属节点。默认静默读取原生临时预览目录（`temp/`），或自由配置自定义暂存目录，配合原生保存节点即可直接待审。
* **双模仓库，选择由你（Flexible Staging）：**
  * **临时审片（默认）：** 留空即审阅 `temp/`，不占额外磁盘，审完/弃用即清理；
  * **持久化审片：** 指定暂存目录（如 `staging` 或绝对路径），配合原生 `Save Image` 节点落盘，跑图与审片彻底解耦。
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
* **相邻图片静默预加载：** 精审第 N 张图时，后台自动预拉取前一张与后一张大图，左右快速切图 0ms 等待。
* **参数侧边栏：**
  * 静态解析主 Checkpoint / Net 模型、采样器、调度器、CFG、步数与种子；
  * 提示词与反向提示词专属展示，支持一键单独复制；
  * **常驻【挂载 LoRA】面板：** 直观展示生效的 LoRA 药丸标签与强度，支持一键批量复制 `<lora:name:strength>` 标准标签。

### 4. 灵活转存与安全机制 (Export & Safeguard)

* **乐观 UI（Optimistic UI）：** 点击转存立即从视图剥离条目，后台异步执行并连带清理缓存，失败支持安全回滚。
* **丰富占位符（Tokens）：** 支持 `%date%`、`%time%`、`%model%`、`%sampler%`、`%scheduler%`、`%seed%`、`%cfg%`、`%steps%`、`%count%`（并发安全自增）等动态命名与多级目录组织。
* **多格式与元数据封装：** 支持免转码 PNG 直出，以及 WebP / JPEG 自定义画质转码，并自动注入标准 `EXIF:UserComment` 或 `XMP`。

---

## 📌 当前版本适用说明 (v0.1.0-minimal)

本版本专注于**最轻量、高可靠的纯静态拓扑抓取**：

* 推荐工作流：标准单采样流（原生 `KSampler`、`CLIPTextEncode`、标准模型与 LoRA 加载链路）；
* 对于包含复合多管线、子图嵌套（Group Node）或内部含条件分支切换的复杂工作流，后续版本将推出更优的无感解耦方案。

---

## ⌨️ 快捷键拓扑映射表

工作台打开时全局生效，不污染 ComfyUI 画布：

| 快捷键                     | 作用域   | 功能行为                                       |
| :------------------------- | :------- | :--------------------------------------------- |
| `Esc`                    | 全局     | 退出深度精审返回总览 / 关闭审片工作台          |
| `X`                      | 精审模式 | 快速切换当前图的标记/勾选状态                  |
| `Enter` / `Space`      | 全局     | 执行转存（精审模式单张转存；总览模式批量转存） |
| `Delete` / `Backspace` | 全局     | 物理废弃删除图片及对应缓存                     |
| `←` / `→`            | 精审模式 | 快速切换查看上一张 / 下一张（预加载）          |
| `Ctrl + A`               | 总览模式 | 全选当前待审列表所有图片                       |
| `Ctrl + I`               | 总览模式 | 反选图片                                       |

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

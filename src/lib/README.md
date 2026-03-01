# lib

核心业务逻辑与通用函数。

## 根目录文件

- **colors.js** — 线路颜色选择与规范化（含基于现有线路颜色差异度的自动选色）
- **geo.js** — 地理/几何计算（投影、距离、相交、包围盒、八向折线路径生成）
- **ids.js** — 全局 ID 生成
- **lineNaming.js** — 线路命名工具（环线名去"起终点"后缀、显示名归一化）
- **lineStyles.js** — 线路线型定义与归一化（单线/双线、虚线、点线等跨渲染层配置）
- **projectModel.js** — 工程数据模型与标准化（含线路状态、线型、自动排版配置 `layoutConfig`、线段级线型覆盖 `lineStyleOverride`、`timelineEvents` 年份字段数值化兼容）
- **shortcutRegistry.js** — 快捷键注册与持久化（默认绑定、冲突检测、显示格式化；工具项文案使用“添加站点工具/添加线段工具/连续布线工具/命名布线工具”等全称）
- **transfer.js** — 手动换乘关系工具（站点对归一化、换乘联通分组、有效换乘线路集合计算）
- **uiPreferences.js** — UI 主题偏好定义与归一化（本地持久化键、默认值）
- **validation.js** — 工程数据校验
- **migration.js** — 工程数据版本迁移

## 子目录

- **ai/** — LLM 能力封装（站点命名候选生成、结构化 JSON 校验与回退），详见 `ai/README.md`
- **hud/** — 车辆 HUD 渲染模型（线路主路径、方向、换乘标识、超长单弯折返），详见 `hud/README.md`
- **export/** — 导出逻辑（实际走向高清图、分享小图、官方风格图、车辆 HUD ZIP），详见 `export/README.md`
- **layout/** — 布局 Worker 调用端，详见 `layout/README.md`
- **navigation/** — 站间路径规划（Dijkstra 最短路与分段渲染），详见 `navigation/README.md`
- **ranking/** — 全球轨道交通排行榜与工程里程排名计算（Wikipedia 实时榜单解析），详见 `ranking/README.md`
- **schematic/** — 示意图渲染模型（预览与导出共享，支持线段级线型覆盖），详见 `schematic/README.md`
- **osm/** — OSM 导入与 Overpass 请求，详见 `osm/README.md`
- **storage/** — 本地存储与工程文件读写（含线段级线型覆盖持久化），详见 `storage/README.md`
- **timeline/** — 时间轴动画引擎，详见 `timeline/README.md`
- **tts/** — 站内播报文案与语音拼接（模板生成、片段合成）

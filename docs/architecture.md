# 技术架构

## 技术栈

| 类别 | 技术 |
|------|------|
| 前端框架 | Vue 3（Composition API + `<script setup>`） |
| 状态管理 | Pinia |
| 地图渲染 | MapLibre GL JS |
| 地理计算 | Turf.js |
| 地图数据 | OpenStreetMap / Overpass API / Nominatim |
| 构建工具 | Vite |
| 数据存储 | IndexedDB（idb） |
| 文件处理 | JSZip |
| 图标 | Lucide Vue Next |

## 项目结构

```
src/
├── components/          # Vue 组件
│   ├── map-editor/      # 地图编辑器
│   ├── panels/          # 侧边面板
│   └── toolbar/         # 工具栏
├── lib/                 # 核心业务逻辑
│   ├── ai/              # AI 站点命名
│   ├── animation/       # 时间线动画
│   ├── export/          # PNG/HUD 导出
│   ├── hud/             # 车载 HUD 显示
│   ├── layout/          # 自动布局算法
│   ├── network/         # 网络图操作
│   ├── osm/             # OpenStreetMap 集成
│   ├── schematic/       # 示意图生成
│   ├── storage/         # 数据持久化
│   └── timeline/        # 时间线管理
├── stores/              # Pinia 状态管理
├── composables/         # 组合式函数
├── workers/             # Web Workers
├── data/                # 静态数据
└── assets/              # 静态资源
```

## 关键设计决策

### MapLibre GL JS

选择 MapLibre 而非 Mapbox：开源免费、性能优秀、矢量瓦片支持、社区活跃。

### Web Worker

布局算法计算密集，使用 Web Worker 避免阻塞 UI，支持大规模网络（100+ 站点）流畅运行。

### GeoJSON

采用标准化地理数据格式，与 OSM 数据无缝对接，易于序列化和存储。

### IndexedDB

使用 IndexedDB 实现自动保存，防止数据丢失，支持大容量数据存储。

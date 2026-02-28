# components/map-editor

`MapEditor.vue` 的可复用子模块（纯函数与常量）。

## 文件说明

- **MapContextMenu.vue** — 地图右键上下文菜单（模式切换、站点/线段/锚点就地操作，模式文案使用“添加站点/添加线段/连续布线”等全称）
- **constants.js** — 图层/数据源标识常量与曲线分段参数
- **mapStyle.js** — MapLibre 底图样式定义
- **dataBuilders.js** — 真实地图导出与渲染所需纯函数（边界/站点/线段/锚点 GeoJSON 构建、线段点序校正、曲线插值、工程边界统计、导出文件名清洗、线路名属性注入）
- **mapLayers.js** — 地图图层管理（ensureMapLayers、ensureSources、updateMapData、线路样式表达式构建、站名/线路名/换乘标记显隐控制，含分区覆盖/人口热力/主干道高亮等叠加图层）
- **bfsPathFinder.js** — BFS 遍历查找两站间的边路径，用于 Alt+点击线段时选中整条线路

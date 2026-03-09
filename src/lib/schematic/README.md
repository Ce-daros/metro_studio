# lib/schematic

示意图渲染模型层，统一"界面预览"和"文件导出"的视觉语义与几何处理。

## 文件说明

- **renderModel.js** — `buildSchematicRenderModel(project, options)` 读取 `stations/edges/lines/layoutMeta`，生成官方风视图所需的渲染模型（背景、线路路径、站点标签）。处理共线偏移、圆角折线、线路状态透明度与线路线型；年份筛选时会按共线段的按线路开通时间裁剪可见线路。支持 `options.mirrorVertical` 按画布中心执行上下镜像。

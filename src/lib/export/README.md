# lib/export

导出模块，将工程输出为发布素材。

## 文件说明

- **exportSchematic.js** — 生成 SVG 字符串（`buildSchematicSvg`）、导出官方导示图（`downloadOfficialSchematicPng`）、批量渲染车辆 HUD PNG 并 ZIP 打包下载（`downloadAllLineHudZip`）。基于 `lib/schematic/renderModel.js` 和 `lib/hud/renderModel.js` 的统一渲染模型。
- **exportText.js** — 导出人类可读线网概览文本；按“线路在某段上的实际开通年份/分期”分组统计，共线段会分别归入对应线路年份，不再被单个线段年份误导

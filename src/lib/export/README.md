# lib/export

导出模块，将工程输出为发布素材。

## 文件说明

- **exportSchematic.js** — 生成 SVG 字符串（`buildSchematicSvg`）、导出官方导示图（`downloadOfficialSchematicPng`）、批量渲染车辆 HUD PNG 并 ZIP 打包下载（`downloadAllLineHudZip`）。基于 `lib/schematic/renderModel.js` 和 `lib/hud/renderModel.js` 的统一渲染模型。

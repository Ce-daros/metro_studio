# Metro Studio

<img width="2548" height="1426" alt="image" src="https://github.com/user-attachments/assets/e749d130-ce1d-4d88-9c89-ab2b0a4f9f34" />

https://metro-studio-iota.vercel.app/

[![License: GPL v3](https://img.shields.io/badge/License-GPL%20v3-blue.svg)](LICENSE)

在真实地图上轻松绘制专业的地铁线路图。

## 什么是 Metro Studio

Metro Studio 是一个地铁线路图编辑器，专为轨道交通爱好者设计。你可以在 OpenStreetMap 地图上绘制地铁线网，自动生成官方风格的示意图，并导出为图片。

## 功能特性

- √ 在真实地图上绘制地铁线网
- √ 自动生成八方向规整的示意图
- √ 多视图：地图视图 / 示意图视图 / 车载 HUD 视图 / 时间线视图
- √ 框选、多选、批量编辑
- √ 导出 PNG 高清图片和 HUD 资源打包
- √ AI 辅助翻译站点英文名
- √ 从 OpenStreetMap 导入真实数据
- √ 搜索 OSM 地标、地点、POI

## 核心功能

<img width="2546" height="1311" alt="image" src="https://github.com/user-attachments/assets/a1a3b963-3893-4f36-a7a1-20477e28e7ea" />

<img width="2546" height="1311" alt="image" src="https://github.com/user-attachments/assets/adbf7c29-2a85-44f8-968e-f41992f77eae" />

**地图编辑**

在真实地图上点击添加站点、拖拽连线、绘制线路。支持框选、多选、批量编辑。

**自动排版**

一键生成八方向规整的地铁示意图，算法自动优化线路布局。

**多视图展示**

- 地图视图：真实地理位置编辑
- 示意图视图：官方风格线路图
- 车载 HUD 视图：模拟车辆显示屏
- 时间线视图：线网发展历程动画

**导出与分享**

导出 PNG 高清图片、HUD 资源打包、项目数据文件。

<img width="2301" height="1255" alt="image" src="https://github.com/user-attachments/assets/186290f2-477d-4095-86b6-d1b2f03aee57" />


**AI 辅助**

自动翻译站点中文名为规范英文名。

<img width="1017" height="763" alt="image" src="https://github.com/user-attachments/assets/19c181a0-0c70-4379-ac27-c685d96c27bf" />


**数据导入**

从 OpenStreetMap 导入真实的地铁线网数据。

## 快速开始

### 在线使用

https://metro-studio-iota.vercel.app/

### 本地运行

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build
```

### AI 功能配置

1. 打开菜单栏 → 设置 → AI 配置
2. 填写 API Base URL（支持 OpenAI 兼容 API）
3. 填写 API Key
4. 保存配置

## 快捷键

- `Delete` / `Backspace`：删除选中对象
- `Ctrl/Cmd + F`：搜索地点
- `Ctrl/Cmd + A`：全选站点
- `Ctrl/Cmd + C`：复制选中线段
- `Ctrl/Cmd + V`：粘贴线段
- `Ctrl/Cmd + Z`：撤销
- `Ctrl/Cmd + Shift + Z`：重做
- `Esc`：取消选择
- `Alt + 点击线段`：选中整条线路

## 技术栈

Vue 3 · Pinia · MapLibre GL JS · OpenStreetMap

## 贡献

欢迎贡献代码、报告问题或提出建议。详见 [贡献指南](CONTRIBUTING.md)。

## 更新日志

查看完整的版本更新历史：[CHANGELOG.md](CHANGELOG.md)

## 许可证

GPL-3.0 License · 详见 [LICENSE](LICENSE)

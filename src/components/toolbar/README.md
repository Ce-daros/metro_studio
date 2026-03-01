# components/toolbar

历史 toolbar 子组件目录（当前主界面未挂载）。

## 文件说明

- **ToolbarProjectTab.vue** — 项目管理选项卡（新建/重命名/复制/删除工程、文件导入导出、本地工程检索列表）
- **ToolbarWorkflowTab.vue** — 工具/工作流选项卡（编辑模式切换：添加站点/添加线段/连续布线/命名布线等，选择控制、撤销/重做、AI 翻译、geoSeedScale 滑块、自动排版触发、年份事件编辑入口）
- **ToolbarObjectTab.vue** — 对象属性选项卡（年份事件编辑入口、站点属性编辑/批量重命名/AI 全自动命名、线段批量属性、线路全属性编辑）
- **ToolbarPublishTab.vue** — 发布导出选项卡（车站显示模式、实际走向图/官方风格图/HUD 图打包导出）
- **toolbar-shared.css** — 所有 toolbar 子组件共享的 BEM 样式（粉紫高对比终端主题、切角按钮/输入、Glitch 悬停反馈、列表与滚动条统一风格），以非 scoped 方式导入

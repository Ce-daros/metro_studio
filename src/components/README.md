# components

UI 组件，负责交互与渲染。

## 根目录文件

- **App.vue** — 主布局容器（工作区三视图切换、无已打开工程欢迎页路由、页面关闭/刷新二次确认）
- **MapEditor.vue** — 基于 MapLibre 的真实地图编辑器（OSM 瓦片底图、站点点击/拖拽/添加站点/添加线段、AI 添加站点、连续布线/命名布线、线段曲线渲染、锚点交互、框选、右键菜单、键盘快捷键，地图网格通过地理图层渲染并随平移/缩放同步）
- **SchematicView.vue** — 渲染自动排版后的示意图（地理主导示意图、滚轮缩放、中键平移）
- **SchematicControls.vue** — 示意图视图排版控制菜单（站点显示、线路显示、布局参数的实时调整；支持“骨架展开 / 枢纽分流 / 紧凑程度 / 直线优先 / 标签避让”五轴语义降维控制，以及参数预设的选择、另存、覆盖、删除、导出、导入）
- **VehicleHudView.vue** — 车辆 HUD 视图（按线路 + 方向自动生成、线路/方向选择控件、换乘标识、方向箭头、环线双层闭合轨道、超长线折返）
- **TimelinePreviewView.vue** — 时间轴动画实时预览视图（Canvas 2D + requestAnimationFrame、播放控制、速度选择、全屏、伪"发展史"线序预览）
- **MenuBar.vue** — 顶部菜单栏（文件/编辑/视图/AI/导出/统计/设置，含右上角建设年份与工程期数快捷设定，便于新绘制线段自动继承开通年份/分期标签；线路切换器与下拉项图标按线路色显示）
- **NoProjectWelcome.vue** — 未打开工程欢迎页（按参考稿复刻：Canvas 网格粒子、三层色散故障字效、双操作卡片与右侧全息面板）；顶部副标题 ID 在组件挂载期固定，避免每次重渲染随机跳变
- **PropertiesPanel.vue** — 右侧属性面板容器（根据选中对象动态切换子面板，含网格纹理、机能标签与切角控件，并固定提供“年份事件”编辑区）
- **TimelineSlider.vue** — 时间轴滑块控件（年份筛选、播放控制）
- **TimelineEventEditor.vue** — 时间轴事件编辑器（在右侧属性面板固定显示；支持新增自定义年份、同一年多条事件、按组设置“开通前/开通后/年度最后(全网)”展示时机，并支持逐条编辑/删除；支持按年设置“之前/之后”延时，延时输入实时写入项目状态，不依赖失焦触发；新增年份区与事件条目在窄屏下自适应重排）
- **StatisticsDialog.vue** — 统计信息弹窗（含线网概况、各线路排行、基础概况、路径分析、换乘枢纽、线路分析；路径栏位超长站名自动换行，避免撑宽弹窗）
- **ProjectListDialog.vue** — 项目列表对话框
- **ConfirmDialog.vue** — 确认对话框
- **PromptDialog.vue** — 输入对话框
- **ToastContainer.vue** — Toast 通知容器
- **ErrorBoundary.vue** — 错误边界组件
- **StatusBar.vue** — 底部状态栏（战术终端风标签与保存状态指示，含“命名布线”模式文案）
- **ToolStrip.vue** — 工具条组件（仅地图视图显示，窄栏悬浮玻璃样式与激活态强调；提供模式切换与撤销/重做，含“命名布线”入口，不再包含草稿笔/橡皮擦）
- **AccordionSection.vue** — 手风琴折叠面板
- **DropdownMenu.vue** — 下拉菜单
- **TooltipWrapper.vue** — Tooltip 包装器
- **IconBase.vue** — 图标基础组件
- **IconSprite.vue** — 图标精灵表

## 子目录

- **map-editor/** — `MapEditor.vue` 的可复用子模块（纯函数与常量），详见 `map-editor/README.md`
- **toolbar/** — 历史 toolbar 子组件目录（当前主界面未挂载），详见 `toolbar/README.md`
- **panels/** — 属性面板子组件，详见 `panels/README.md`

# composables

Vue 3 Composition API composables，封装可复用的组件逻辑。

## 文件说明

### 地图编辑器相关
- **useMapContextMenu.js** — 右键菜单状态、位置调整、所有 `*FromContext` 操作函数
- **useMapLineSelectionMenu.js** — 线路选择菜单状态、选择逻辑
- **useMapExport.js** — PNG 导出全流程（实际走向高清图、分享小图、截图抓帧与高分辨率分块渲染）
- **useMapEventHandlers.js** — 点击/拖拽/鼠标事件处理、`dragState`/`anchorDragState`/`selectionBox` 状态，供地图编辑器组合使用
- **useMapBoundary.js** — 边界哈希、`fitMapToBoundary`、边界 watcher
- **useRouteDrawPreview.js** — 连续布线预览状态、距离计算、颜色渐变（用于 `route-draw` 模式）
- **useMapTimelinePlayer.js** — 时间轴播放器生命周期管理
- **useMapNavigation.js** — 地图导航图层、点击选点与路径高亮管理；缺少导航状态时会安全降级为空状态，并输出导航诊断日志
- **useMapReachability.js** — 地图可达性圈层与标签渲染；缺少可达性状态时会安全降级为空状态，并输出可达性诊断日志
- 说明：草稿笔/橡皮擦相关 composable 已移除

### 工具栏相关
- **useToolbarProjectManagement.js** — 项目列表、创建/加载/重命名/复制/删除、文件导入
- **useToolbarStationOps.js** — 站点表单、重命名、批量重命名、删除、全选
- **useToolbarEdgeOps.js** — 线段批量表单、线段属性更新、线路重分配
- **useToolbarLineOps.js** — 线路表单、增删改
- **useToolbarEditYear.js** — 年份输入、规范化、增减

### 其他视图相关
- **useMenuBarActions.js** — 菜单项定义（文件/编辑/视图/导出/统计/设置/帮助 7 个 computed 菜单结构）；统计菜单内置 3 项实时基础数据并可打开独立统计弹窗，支持视图菜单一键切换“高亮主干道”，AI 配置与 API Key 配置归入设置菜单；无已打开工程时会自动禁用保存/导出类操作，同时负责 action 分发与城市预设过滤
- **useViewportControl.js** — 缩放/平移/鼠标事件、viewport transform 计算（用于 VehicleHudView）
- **useTimelinePlayback.js** — 播放控制（play/pause/stop/speed）、renderer 生命周期、全屏（用于 TimelinePreviewView）
- **useSequentialStationReview.js** — 顺序站点处理流（快速命名 / 英文审查）；支持按线路区间遍历，也支持直接传入站点 ID 列表启动，并可附加过滤条件只处理默认占位名站点

### 通用工具
- **useAutoSave.js** — 自动保存节流与状态管理
- **useDialog.js** — 全局对话框状态管理（confirm/prompt）
- **useToast.js** — Toast 通知状态管理
- **usePanelResize.js** — 面板拖拽调整尺寸
- **useWorldMetroRanking.js** — 全球轨道交通排名数据获取与计算

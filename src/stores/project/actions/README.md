# stores/project/actions

`projectStore` actions 按职责拆分。

## 文件说明

- **lifecycle.js** — 工程生命周期（初始化、新建、重命名、复制、删除、按 ID 加载、列表）；支持“无已打开工程”空状态，应用启动默认进入欢迎页，不再自动加载最近工程
- **selection.js** — 交互状态（模式、当前线路、站点/线段选择、多选、连续布线、单站 `PgUp` / `PgDn` 切站）；同时负责排版参数预设的应用、保存、删除、单文件导入导出
- **networkEditing.js** — 线网编辑聚合入口，通过对象展开合并以下子模块，并提供共享簿记方法（syncConnectedEdgeEndpoints、recomputeStationLineMembership、setCurrentEditYear、setCurrentEditPhase）
- **stationActions.js** — 站点编辑（加站、移动、重命名、批量重命名、删除）；批量命名按当前选中顺序编号
- **stationAiActions.js** — AI 英文站名翻译（全图/按 ID/选中站点）
- **transferActions.js** — 手动换乘关系编辑（增删换乘绑定）
- **lineActions.js** — 线路管理（增删改、上下移动、查找或创建激活线路）
- **edgeActions.js** — 线段编辑（选中、加边、删除、批量属性、锚点操作、分割、合并）；共线段按线路维护 `openingYear/phase`，新增共线时会为新线路单独记时，合并线段也会阻止不一致的共线时间元数据被错误折叠
- **history.js** — 编辑历史记录（快照栈、连续编辑合并、撤销/重做）
- **mapPreferences.js** — 地图显示偏好（站名/线路名/换乘标记/区域覆盖/人口热力/主干道高亮/网格/坐标开关、瓦片类型、API Key）
- **importLayout.js** — OSM 导入与自动排版触发；城市模板导入现改为优先生成独立新工程，避免主菜单误把当前工程当作导入目标；其余导入流程仍会识别“仅默认占位线”的空工程并按需复用；自动排版会在启用语义降维参数时将五轴 UI 控制投影为 Worker 配置
- **exportPersistence.js** — 工程文件导入导出、PNG/HUD 导出、持久化节流、真实地图导出器注册
- **timelineActions.js** — 时间轴动画相关 action（年份筛选、播放状态、播放速度、事件增删）；切换筛选年份时会自动清理不可见站点/线段/锚点的选中状态，避免隐藏对象被继续操作；共线段是否可见按“该线路是否已在该年开通”判断

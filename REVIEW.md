# Metro Studio 代码审查报告

> 审查日期: 2026-02-23 | 项目版本: 1.0.0-rc.9

## 项目概览

基于 Vue 3 + Vite 的地铁/轨道交通网络设计与可视化 SPA。

| 层 | 技术 |
|---|---|
| 框架 | Vue 3.5 (Composition API + `<script setup>`) |
| 构建 | Vite 7.3 |
| 状态管理 | Pinia 3.0 (单一 Options API store) |
| UI 库 | Naive UI |
| 地图 | MapLibre GL |
| 存储 | IndexedDB (idb) |
| 语言 | 纯 JavaScript + JSDoc (无 TypeScript) |

---

## P0 - 必须立即修复

### 1. `mergeEdgesAtStation` 缺少 `touchProject` 调用

- **文件**: `src/stores/project/actions/edgeActions.js` (函数末尾，约第 567-676 行)
- **问题**: 合并操作执行完毕后没有调用 `this.touchProject(...)`，也没有 `return true`
- **影响**: 操作不会记录到 undo/redo 历史，不会触发自动保存，调用方无法判断成功与否
- **修复**: 在函数末尾添加 `this.touchProject('合并边')` 和 `return true`

### 2. Style Brush 错误复制 waypoints 和 sharedByLineIds

- **文件**: `src/stores/project/actions/styleBrushActions.js`
- **问题**: `applyStyleToEdge` 方法（约第 119-133 行）将源 edge 的 `waypoints` 复制到目标 edge。waypoints 是与具体站点位置绑定的几何数据，跨 edge 复制会产生错误的几何形状。同理 `sharedByLineIds` 的复制会破坏网络拓扑
- **修复**: 从样式刷的属性复制列表中移除 `waypoints` 和 `sharedByLineIds`，这两个是拓扑/几何属性而非样式属性

### 3. 零测试覆盖

- **问题**: 整个项目没有任何测试文件（无 `*.test.js`、`*.spec.js`、`__tests__/`）
- **影响**: 对于 RC 阶段的项目，核心逻辑无自动化验证，回归风险极高
- **建议**: 优先为以下模块添加单元测试（使用 Vitest）：
  - `src/stores/project/actions/` — 所有 store action
  - `src/lib/validation.js` — 项目校验与修复
  - `src/lib/migration.js` — 数据迁移
  - `src/lib/navigation/dijkstra.js` — 路径导航
  - `src/lib/projectModel.js` — normalizeProject

---

## P1 - 应尽快修复

### 4. IndexedDB 无错误处理与重试

- **文件**: `src/lib/storage/db.js`
- **问题**: 所有 IndexedDB 操作没有 try/catch。`dbPromise` 是模块级单例，首次 `openDB` 失败（隐私模式、存储配额）后所有后续调用都会失败且无重试
- **修复**: 
  - 为所有导出函数添加 try/catch
  - 将 `dbPromise` 改为 `getDb()` 函数，失败时可重试

### 5. 硬编码 URL 应外部化

以下 URL 应移至 `.env` 或运行时配置：

| 文件 | URL | 说明 |
|---|---|---|
| `src/lib/tts/ttsClient.js:1` | `http://localhost:9880` | TTS 服务地址，非本地环境必然失败 |
| `src/lib/ai/aiConfig.js:4` | `https://api.bltcy.ai` | AI API 基础地址 |
| `src/lib/ai/openrouterClient.js:31` | `https://api.bltcy.ai` | AI API 回退地址 |
| `src/composables/useLicense.js:7` | `https://metro-back.angelkawaii.xyz/buy` | 支付页面地址 |

### 6. `selectStation` 在 route-draw 模式下静默失败

- **文件**: `src/stores/project/actions/selection.js` 第 234 行
- **问题**: `addEdgeBetweenStations` 返回 null（失败）时，路径绘制链仍然继续，无错误反馈
- **修复**: 检查返回值，失败时中断链并通过 `statusText` 提示用户

---

## P2 - 建议改进

### 7. Pinia Store 使用 Options API 且为巨型单一 Store

- **文件**: `src/stores/projectStore.js`
- **问题**: 使用 `defineStore('project', { state, getters, actions })` Options API 风格，与项目其他部分全部使用 Composition API 不一致。19 个 action 模块通过 spread 合并，状态树庞大且耦合度高
- **建议**: 迁移到 Setup 风格 `defineStore('project', () => { ... })`，并考虑将 selection、history、navigation 等拆分为独立子 store

### 8. 组件直接修改 Store 属性（绕过 action）

以下位置直接赋值 store 属性而非通过 action：

| 文件 | 行 | 代码 |
|---|---|---|
| `src/App.vue` | 134 | `store.project.meta.hasAutoLayoutTriggered = true` |
| `src/App.vue` | 233 | `store.statusText = '...'` |
| `src/App.vue` | 345 | `store._showUpgradeDialog = showUpgradeDialog` (运行时 patch 私有属性) |
| `src/composables/useMapEventHandlers.js` | 329-334 | 多处直接赋值 selection 相关属性 |

**修复**: 为这些操作创建对应的 store action

### 9. O(n) 查找代替 O(1) getter

- **文件**: `src/stores/project/actions/styleBrushActions.js`
- **问题**: 使用 `this.project.stations.find(...)` / `this.project.edges.find(...)` 而非 store 已有的 `stationById` / `edgeById` Map getter。批量操作中为 O(n*m) 复杂度
- **修复**: 统一使用 `this.stationById.get(id)` / `this.edgeById.get(id)`

### 10. `useMapEventHandlers` 过于庞大

- **文件**: `src/composables/useMapEventHandlers.js` (589 行)
- **问题**: 无生命周期清理、`getMap()` 返回 null 时无保护、直接修改 store 属性。拖拽过程中 map 被销毁可能导致运行时错误
- **建议**: 
  - 拆分为 `useStationDrag`、`useBoxSelection`、`useEdgeAnchorDrag` 等子 composable
  - 所有 `getMap()` 调用后添加空值保护

### 11. `MapEditor.vue` 深度 watcher 性能隐患

- **文件**: `src/components/MapEditor.vue` 第 621 行
- **问题**: `{ deep: true }` 监听整个 `store.project`，每次嵌套变更都会触发
- **建议**: 使用更精确的 watcher 或 `store.$subscribe` 替代

### 12. 清理死代码

| 文件 | 死代码 |
|---|---|
| `src/stores/projectStore.js` | `networkStatistics` getter 无条件返回 `null` |
| `src/components/MenuBar.vue` | `lineMenuItems` computed、`onLineSelect` 函数、`menuButtonRects` ref、`lineDropdownRect` ref 均未使用 |
| `src/stores/project/actions/styleBrushActions.js` 第 2-7 行 | `styleBrush` 属性是死代码（实际状态在 store state 中定义） |

---

## P3 - 可选优化

### 13. JSDoc 类型定义不完整

- **文件**: `src/lib/projectModel.js`
- `RailProject` typedef 缺少 `regionBoundary`、`annotations` 字段
- `region` 定义为非空对象，但 `createEmptyProject` 设为 `null`
- `RailStation.transferLineIds` 在 `db.js` 序列化时被丢弃（存取往返数据丢失）
- `meta.hasAutoLayoutTriggered` 未在 typedef 中声明

### 14. 默认坐标不一致

- `src/lib/constants.js` 中 `DEFAULT_MAP_CENTER` 是北京 `[116.40, 39.90]`
- `src/lib/projectModel.js` 的 `normalizeProject` 中默认站点坐标是济南 `[117.0, 36.65]`

### 15. `useToast` / `useDialog` 模块单例模式

- **文件**: `src/composables/useToast.js`、`src/composables/useDialog.js`
- 使用模块级 `let xxxApi = null` + `setXxxApi()` 初始化，不可 tree-shake，测试时无法注入 mock
- `useToast` 不使用任何 Vue 响应式特性，`use` 前缀有误导性

### 16. 中文字符串硬编码

- 所有 action 中的状态消息（如 `'已全选所有线路'`）直接硬编码，无 i18n 支持
- 如果未来需要多语言支持，需要大量重构

### 17. `migration.js` 直接修改输入对象

- **文件**: `src/lib/migration.js`
- `migrateProject` 直接修改传入的 `rawData`，与 `repairProject`（深拷贝后修改）行为不一致

---

## 架构亮点

- 所有 `.vue` 组件统一使用 `<script setup>` Composition API，无 Options API 混用
- 30 个 composable 提取合理，`MapEditor.vue` 委托 9 个 composable 保持了可维护性
- 零 `console.log`、零 `var`、零 `eslint-disable`
- `useAutoSave` 和 `useShortcuts` 有正确的生命周期清理
- `validation.js` 提供了完整的项目校验与修复机制
- Vite 构建配置合理（manual chunks、terser 压缩、代理配置）
- `db.js` 序列化层对数据做了严格的类型归一化

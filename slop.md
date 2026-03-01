# AI Slop 清理报告

范围：`src/` 代码静态审阅（仅记录问题，不改现有实现）

## 1. 不合理的实现

1. **空工程判断逻辑基本失效，导入时几乎总是新建工程**
   - 位置：`src/stores/project/actions/importLayout.js:108`
   - 现状：`isEmptyProject = !this.project.stations?.length && !this.project.lines?.length`
   - 问题：`createEmptyProject()` 默认就带一条线（`1号线`），所以 `lines.length` 通常不为 0，导致“空工程”分支几乎不会走到。
   - 影响：用户期望覆盖当前空白工程时，实际变成新建副本工程，行为和直觉不一致。

2. **批量翻译进度在失败分支会错误累加，可能超过 100%**
   - 位置：`src/lib/ai/stationEnTranslator.js:362`
   - 现状：chunk 失败时 `done += TRANSLATION_BATCH_SIZE * STATIONS_PER_REQUEST`（固定 +40）。
   - 问题：最后一个 chunk 可能不足 40 站，进度会超算。
   - 影响：UI 进度不可信，可能出现 “>100%” 或提前完成假象。

3. **路径分段按 `sharedByLineIds[0]` 取线路，换乘分段可能错判**
   - 位置：`src/lib/navigation/dijkstra.js:177`
   - 现状：边若被多线共享，直接选第一条线作为该段线路。
   - 问题：线路归属依赖数组顺序，不是路径上下文。
   - 影响：导航分段文案、换乘次数和线路色可能与真实乘车路径不一致。

4. **全球排行榜抓取依赖维基页面 DOM 结构，脆弱**
   - 位置：`src/lib/ranking/worldMetroRanking.js:76`
   - 现状：直接解析 `table.wikitable.sortable`，并按表头字符串定位字段。
   - 问题：上游页面结构或字段名变化即失效。
   - 影响：功能非确定性，容易无预警报错（“未解析出有效数据”）。

## 2. Mock / 演示数据残留

1. **时间轴覆盖层包含内置压力测试 + 全局调试入口**
   - 位置：`src/lib/timeline/timelineCanvasOverlays.js:657`, `:689`
   - 现状：`stressTestLineInfo()` 生成 100 条假线路，挂到 `window.__stressLineInfo`。
   - 问题：生产代码内嵌 demo/stress 入口。
   - 影响：增加运行时表面积，调试代码与业务代码耦合。

2. **欢迎页显示随机“伪 ID”**
   - 位置：`src/components/NoProjectWelcome.vue:850`
   - 现状：`Math.random().toString(16)...` 每次渲染随机。
   - 问题：纯展示噪声，不携带业务意义。
   - 影响：UI 不稳定、截图复现困难、测试快照不友好。

3. **TTS 文案中内置赞助商名单**
   - 位置：`src/lib/tts/announcementTemplates.js:6`
   - 现状：`SPONSORS = ['阿水大杯茶','九阳集团','小鸭集团']`
   - 问题：硬编码品牌属于样板数据，不是可配置业务数据。
   - 影响：跨城市/跨项目复用时内容失真。

## 3. 过度简化逻辑

1. **OSM 边路径失败时直接退化为两点直连**
   - 位置：`src/lib/osm/genericImporter.js:415`, `src/lib/osm/jinan/importer.js:154`
   - 现状：`waypoints` 不足时 fallback 为 `[from, to]`。
   - 问题：忽略真实线形，仅保留直线连接。
   - 影响：里程统计、视觉路径、后续排版质量都会被污染。

2. **无年份数据时使用“伪发展史”（按线路数组顺序）**
   - 位置：`src/lib/timeline/timelineAnimationPlanBuilder.js:610`
   - 现状：虚拟年份 1..N 映射到 `project.lines` 顺序。
   - 问题：数组顺序并非建设时序，语义弱。
   - 影响：用户容易把演示顺序误解为真实历史。

3. **统计弹窗重计算通过 `setTimeout(0)` + 双 rAF 让出主线程**
   - 位置：`src/components/StatisticsDialog.vue:221`, `:226`
   - 现状：主线程重活做“宏任务延后”，而非 worker 化。
   - 问题：这是 UI 层掩盖卡顿，不是根治。
   - 影响：大图下仍可能卡顿，且行为依赖事件循环时序。

## 4. 愚蠢假设 / 过强默认值

1. **项目模型默认站点坐标写死济南**
   - 位置：`src/lib/projectModel.js:229`, `:230`
   - 现状：缺失坐标时回退 `[117.0, 36.65]`。
   - 问题：把坏数据“合法化”为济南点位。
   - 影响：脏数据 silently 进入后续流程，难追踪。

2. **存储序列化也用济南坐标兜底**
   - 位置：`src/lib/storage/db.js:71`
   - 现状：`toPoint(..., [117, 36.65])`
   - 问题：二次固化了同一假设。
   - 影响：错误坐标持久化后更难纠正。

3. **时间轴相机无边界时默认看济南**
   - 位置：`src/lib/timeline/timelineCanvasCamera.js:17`, `src/lib/timeline/timelinePreviewStateMachine.js:78`
   - 现状：默认中心 `116.99, 36.65`。
   - 问题：空数据或异常数据被默认为特定城市。
   - 影响：跨城市项目初始观感偏置，调试误导。

4. **默认地图中心固定北京**
   - 位置：`src/lib/constants.js:6`
   - 现状：`DEFAULT_MAP_CENTER = [116.40, 39.90]`
   - 问题：全局默认和项目地域无关。
   - 影响：首次进入时“瞬移北京”，对非北京项目不友好。

5. **编辑年份硬编码 1900~2100，默认 2010**
   - 位置：`src/lib/constants.js:5`, `src/stores/project/actions/lifecycle.js:25-27`, `src/composables/useToolbarEditYear.js:4-5`
   - 现状：多处重复硬编码。
   - 问题：业务口径散落且武断。
   - 影响：历史网络（1900前）或远期规划（2100后）被静默截断。

6. **AI 默认 API Base 指向单一第三方域名**
   - 位置：`src/lib/ai/aiConfig.js:4`
   - 现状：默认 `https://api.bltcy.ai`
   - 问题：产品默认耦合单供应方。
   - 影响：迁移成本高，离线/私有化场景不友好。

7. **TTS 文案强绑定“济南地铁”**
   - 位置：`src/lib/tts/announcementTemplates.js:49`, `:65`, `:66`
   - 现状：中英文播报模板直接写死 Jinan Metro。
   - 问题：把城市品牌写成常量。
   - 影响：其他城市项目导出文案错误。

## 5. 优先清理建议（按收益排序）

1. 修 `importLayout.js` 的空工程判定（高优先，用户可感知行为错误）。
2. 修 `stationEnTranslator.js` 进度累计（高优先，避免错误反馈）。
3. 去掉或隔离 `window.__stressLineInfo`（中优先，清理调试残留）。
4. 把“济南/北京/年份范围”提取为统一可配置策略（中优先，减少隐式偏置）。
5. 给 OSM 导入 fallback 直线加显式标记，后续可回补真实几何（中优先）。

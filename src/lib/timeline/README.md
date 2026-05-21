# lib/timeline

时间轴动画引擎。

## 文件说明

- **timelineAnimationPlan.js** — 桶文件，re-export `timelineAnimationPlanBuilder.js` 和 `timelineAnimationPlanGeometry.js`
- **timelineAnimationPlanBuilder.js** — 预计算逐年/逐线路渐进绘制计划（`buildTimelineAnimationPlan` 基于线段的按线路 `lineTimeline`，同一物理共线段可在不同年份分别归属不同线路；`buildPseudoTimelineAnimationPlan` 基于 `project.lines` 数组顺序的伪发展史）。边排序、BFS 遍历、累计进度标记、站点揭示触发点。
- **timelineAnimationPlanGeometry.js** — 折线几何辅助函数（`slicePolylineByProgress`）
- **timelinePreviewRenderer.js** — 工厂函数 `createTimelinePreviewRenderer`，实例化 `TimelinePreviewEngine` 并绑定 canvas。桶文件，re-export `timelinePreviewBounds.js` 和 `timelinePreviewStateMachine.js`。
- **timelinePreviewBounds.js** — 地理边界收集（`collectBounds`）与连续绘制计划构建（`buildContinuousPlan`）
- **timelinePreviewStateMachine.js** — `TimelinePreviewEngine` 类，状态机（idle → loading → playing → idle）、瓦片预加载、RAF 循环、相机跟踪、渲染编排；按年份读取 `timelineEvents`（支持同年多条事件分组与 before/after/year_end 位置），同年多条事件会逐条独占显示，单条停留时长按文本字数自适应（wall-clock 计时，不受播放倍速影响）；`year_end` 事件固定在该年最后并切换为全网视角展示；支持按年份配置 `before/after` 延时停留，且对“仅事件无线路”的年份同样生效（包含 before/after）；前置事件的 intro 文案只占用全图停留阶段，镜头开始推近首条线路前会先切到下一真实年份；补播落后的“仅事件年份”时会在当前进度原地停留，不再错误回卷到 0 导致全图清空重播；`progress = 0` 时不会提前揭示首站；播放结束后会先固定展示最后一帧，再缩回全图并落回 idle 全图帧，这段结尾停留不受播放倍速影响；站点弹出、站名淡入与换乘站形变节奏也在这里统一调度
- **timelineCanvasRenderer.js** — Canvas 绘制原语（边/站点/叠加层）。桶文件，re-export 以下子模块；时间轴预览中的换乘站横向拉伸倍率在此定义
- **timelineCanvasEasing.js** — 缓动函数（easeInOutCubic、easeOutCubic、easeOutBack、easeOutElastic）
- **timelineCanvasFont.js** — 字体常量与加载（`FONT_FAMILY`、`loadSourceHanSans`）
- **timelineCanvasCamera.js** — 相机计算（`computeGeoCamera`、`computeFocusCamera`、`lerpGeoCamera`、`computeStatsForYear`）；统计按年份只计算当年已开通的线路归属，避免共线晚开线路被提前计入
- **timelineCanvasGeometry.js** — 几何绘制辅助（`roundRect`、`uiScale`、`geoLineWidth`、`drawGeoPolyline`、`resolveWaypointsSimple`、`measurePillWidth`、`drawStatPill`）
- **timelineCanvasOverlays.js** — 叠加层渲染（年份、统计、事件横幅、比例尺、品牌、线路卡片、扫描线加载动画）；不再挂载 `window` 全局压力测试入口，避免生产代码混入调试钩子
- **timelineTileRenderer.js** — OSM 瓦片缓存与渲染（`TileCache` 类、`renderTiles`、`lngLatToPixel`）。支持分数 zoom 对齐、祖先瓦片回退、进度追踪 API。
- **timelineAnimator.js** — 时间轴动画播放器（旧版，已被 `timelinePreviewRenderer.js` 替代）
- **timelinePlayer.js** — 时间轴播放控制器（旧版，已被 `timelinePreviewRenderer.js` 替代）

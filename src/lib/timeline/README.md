# lib/timeline

时间轴动画引擎。

## 文件说明

- **timelineAnimationPlan.js** — 桶文件，re-export `timelineAnimationPlanBuilder.js` 和 `timelineAnimationPlanGeometry.js`
- **timelineAnimationPlanBuilder.js** — 预计算逐年/逐线路渐进绘制计划（`buildTimelineAnimationPlan` 基于 `openingYear`，`buildPseudoTimelineAnimationPlan` 基于 `project.lines` 数组顺序的伪发展史）。边排序、BFS 遍历、累计进度标记、站点揭示触发点。
- **timelineAnimationPlanGeometry.js** — 折线几何辅助函数（`slicePolylineByProgress`）
- **timelinePreviewRenderer.js** — 工厂函数 `createTimelinePreviewRenderer`，实例化 `TimelinePreviewEngine` 并绑定 canvas。桶文件，re-export `timelinePreviewBounds.js` 和 `timelinePreviewStateMachine.js`。
- **timelinePreviewBounds.js** — 地理边界收集（`collectBounds`）与连续绘制计划构建（`buildContinuousPlan`）
- **timelinePreviewStateMachine.js** — `TimelinePreviewEngine` 类，状态机（idle → loading → playing → idle）、瓦片预加载、RAF 循环、相机跟踪、渲染编排
- **timelineCanvasRenderer.js** — Canvas 绘制原语（边/站点/叠加层）。桶文件，re-export 以下子模块。
- **timelineCanvasEasing.js** — 缓动函数（easeInOutCubic、easeOutCubic、easeOutBack、easeOutElastic）
- **timelineCanvasFont.js** — 字体常量与加载（`FONT_FAMILY`、`loadSourceHanSans`）
- **timelineCanvasCamera.js** — 相机计算（`computeGeoCamera`、`computeFocusCamera`、`lerpGeoCamera`、`computeStatsForYear`）
- **timelineCanvasGeometry.js** — 几何绘制辅助（`roundRect`、`uiScale`、`geoLineWidth`、`drawGeoPolyline`、`resolveWaypointsSimple`、`measurePillWidth`、`drawStatPill`）
- **timelineCanvasOverlays.js** — 叠加层渲染（年份、统计、事件横幅、比例尺、品牌、线路卡片、扫描线加载动画）
- **timelineTileRenderer.js** — OSM 瓦片缓存与渲染（`TileCache` 类、`renderTiles`、`lngLatToPixel`）。支持分数 zoom 对齐、祖先瓦片回退、进度追踪 API。
- **timelineAnimator.js** — 时间轴动画播放器（旧版，已被 `timelinePreviewRenderer.js` 替代）
- **timelinePlayer.js** — 时间轴播放控制器（旧版，已被 `timelinePreviewRenderer.js` 替代）

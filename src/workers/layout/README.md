# workers/layout

自动排版算法实现。基于力导向布局和八方向约束的地铁示意图自动排版引擎。

## 功能概述

- 力导向布局：锚点力、弹簧力、排斥力、交汇扇出、交叉排斥、邻近排斥
- 八方向硬约束：所有边强制对齐到 8 个方向（0°、45°、90°、...、315°）
- 交汇入口分离：对同一枢纽不同方向的入射边做近端走廊分离，避免在换乘站前被压缩到同一条通道
- 线路方向规划：动态规划优化每条线路的方向序列
- 标签自动放置：18 种候选位置模板，基于碰撞检测选择最优位置
- 质量评分：多维度评分系统（角度、长度、重叠、交叉等）

## 文件说明

| 文件 | 说明 |
|------|------|
| **config.js** | 默认配置参数（58 个可调参数）|
| **shared.js** | 数学/几何工具函数、空间索引（网格、边网格）|
| **optimizeLayout.js** | 主流程编排，协调各模块执行 |
| **forces.js** | 力导向阶段：力计算、八方向吸附、直线段拉直 |
| **constraints.js** | 硬约束：八方向投影、交汇入口分离、最小站间距、最小边长 |
| **linePlanning.js** | 线路链路抽取：构建线路的节点和边序列 |
| **labelPlacement.js** | 标签放置：模板生成、碰撞检测、位置选择 |
| **labels.js** | 标签布局集成：协调放置算法与松弛迭代 |
| **scoring.js** | 质量评分：多维度评分计算与数据清洗 |
| **chineseStyleScoring.js** | 中文风格评分：替代评分方案 |

## 核心 API

### `optimizeLayout(payload)`

主入口函数，执行完整的排版流程。

**参数：**
```javascript
{
  stations: [{ id, nameZh, nameEn, lngLat, isInterchange, ... }],
  edges: [{ id, fromStationId, toStationId, waypoints }],
  lines: [{ id, edgeIds }],
  config?: object  // 可选配置覆盖
}
```

**返回值：**
```javascript
{
  stations: [{ ...station, displayPos: [x, y] }],
  score: number,
  breakdown: { angle, length, overlap, crossing, bend, shortRun, geoDeviation, labelOverlap },
  layoutMeta: { stationLabels, edgeDirections },
  elapsedMs: number
}
```

## 算法流程

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  1. 初始化 (Initialize)                                                      │
│     - 规范化种子位置（地理坐标 → 画布坐标）                                  │
│     - 构建 edgeRecords（含 desiredLength）                                  │
│     - 计算节点度数                                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│  2. 力导向迭代 (Force-Directed Layout)                                      │
│     FOR i = 0 TO maxIterations                                              │
│       │  2.1 重置力累加器                                                    │
│       │  2.2 施加各种力                                                     │
│       │      - 锚点力：拉向种子位置                                         │
│       │      - 弹簧力：保持边长                                             │
│       │      - 排斥力：站点间排斥                                           │
│       │      - 交汇扇出：高 degree 站点向外扩散                             │
│       │      - 交叉排斥：推开交叉的边                                       │
│       │      - 邻近排斥：推开平行的边                                       │
│       │  2.3 更新位置（温度衰减）                                           │
│       │  2.4 逐步八方向吸附（每 50 次迭代增加 ratio）                       │
│       │  2.5 拉直线段                                                       │
│       │  2.6 压缩过长边                                                     │
│       │      IF i % 100 == 0: 强制约束                                      │
│       │          - 八方向硬约束                                             │
│       │          - 最小站间距                                               │
│       │          - 最小边长                                                 │
│       ENDFOR                                                               │
├─────────────────────────────────────────────────────────────────────────────┤
│  3. 后处理 (Post-Processing)                                                │
│     - 八方向硬约束（多次迭代精确投影）                                       │
│     - 交汇入口分离（拉开同站不同方向的近端走廊）                             │
│     - 最小站间距约束（网格碰撞检测）                                         │
│     - 最小边长约束（拉长过短的边）                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│  4. 标签放置 (Label Placement)                                              │
│     - 为每个站点生成 18 个候选位置模板                                       │
│     - 基于碰撞检测选择最优位置                                               │
│     - 松弛迭代消除标签重叠                                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  5. 质量评分 (Scoring)                                                       │
│     - 计算各维度评分                                                         │
│     - 返回结果                                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 配置参数

### 迭代与温度
```javascript
maxIterations: 1700,        // 最大迭代次数
cooling: 0.9972,            // 温度衰减系数
initialTemperature: 9.8,    // 初始温度
```

### 力权重
```javascript
anchorWeight: 0.0135,       // 锚点力权重
springWeight: 0.032,        // 弹簧力权重
repulsionWeight: 58,        // 排斥力权重
junctionSpreadWeight: 8.5,  // 交汇扇出权重
crossingRepelWeight: 1.8,   // 交叉排斥权重
proximityRepelWeight: 1.2   // 邻近排斥权重
```

### 约束
```javascript
minStationDistance: 50,     // 最小站间距
minEdgeLength: 32,          // 最小边长
octilinearRelaxIterations: 40,   // 八方向松弛迭代次数
octilinearExactPasses: 3,         // 八方向精确投影次数
junctionSpacingPasses: 18,        // 交汇入口分离迭代次数
junctionAdjacentMinDistance: 42,  // 相邻方向走廊最小间距
```

### 标签
```javascript
labelRelaxIterations: 26,   // 标签松弛迭代次数
labelPadding: 6,            // 标签内边距
labelClearance: 8           // 标签与边的间隙
```

## 核心算法

### 1. 空间索引（加速计算）

```javascript
// 网格空间索引，O(1) 邻近查询
function buildSpatialGrid(points, cellSize) {
  const grid = new Map();
  for (const point of points) {
    const key = `${Math.floor(point[0]/cellSize)},${Math.floor(point[1]/cellSize)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(point);
  }
  return { grid, cellSize };
}
```

### 2. 八方向吸附

```javascript
// 逐步将边吸附到 8 个方向
function snapEdgesToEightDirections(positions, edgeRecords, ratio) {
  for (const edge of edgeRecords) {
    const from = positions[edge.fromIndex];
    const to = positions[edge.toIndex];
    const angle = Math.atan2(to[1] - from[1], to[0] - from[0]);
    const snapped = snapAngle(angle, ratio);  // ratio 从 0 渐增至 1
    const length = distance(from, to);
    positions[edge.toIndex] = [
      from[0] + length * Math.cos(snapped),
      from[1] + length * Math.sin(snapped)
    ];
  }
}
```

### 3. 标签放置

```javascript
// 18 个候选位置模板
function buildLabelTemplates(station, config, degree) {
  const templates = [];
  const distances = [config.nearDist, config.midDist, config.farDist];
  const angles = [0, Math.PI/2, Math.PI, -Math.PI/2];  // N/E/S/W

  for (const angle of angles) {
    for (const dist of distances) {
      templates.push({
        dx: dist * Math.cos(angle),
        dy: dist * Math.sin(angle),
        angle
      });
    }
  }

  // 高 degree 站点增加对角位置
  if (degree > 2) {
    const diagonals = [Math.PI/4, 3*Math.PI/4, -3*Math.PI/4, -Math.PI/4];
    for (const angle of diagonals) {
      templates.push({ dx: config.diagDist * Math.cos(angle), dy: ..., angle });
    }
  }

  return templates;
}
```

## 评分系统

### 标准评分（scoring.js）

| 维度 | 说明 | 权重 |
|------|------|------|
| angle | 边与八方向的偏离度 | 1.0 |
| length | 边长与期望长度的偏差 | 0.5 |
| overlap | 站点间重叠 | 10.0 |
| crossing | 边交叉 | 5.0 |
| bend | 线路转弯惩罚 | 1.0 |
| shortRun | 短方向段（<3 条边） | 0.3 |
| geoDeviation | 与种子位置的偏离 | 0.1 |
| labelOverlap | 标签重叠 | 5.0 |

### 中文风格评分（chineseStyleScoring.js）

- 更强调正交方向（N/E/S/W）
- 更长的直线段偏好
- 中等的地理保持
- 更重的交叉惩罚
- 统一的边长

## 数据结构

### edgeRecords（边记录）
```javascript
{
  fromIndex: number,      // 起点在 positions 数组中的索引
  toIndex: number,        // 终点索引
  desiredLength: number,  // 期望长度
  lineIds: string[],      // 共享此边的线路
  isLoop: boolean         // 是否属于环线
}
```

### lineChains（线路链路）
```javascript
{
  lineId: string,
  nodePath: number[],     // 站点索引序列
  edgePath: number[],     // 边索引序列
  isCycle: boolean        // 是否为环路
}
```

### stationLabels（站点标签）
```javascript
Map<stationId, {
  dx: number,  // X 偏移
  dy: number,  // Y 偏移
  anchor: [number, number]  // 锚点位置
}>
```

## 依赖关系

```
optimizeLayout.js
  ├── config.js
  ├── forces.js
  ├── constraints.js
  ├── labels.js
  │   └── labelPlacement.js
  ├── linePlanning.js
  ├── scoring.js
  ├── chineseStyleScoring.js
  └── shared.js
```

## 性能优化

1. **空间网格索引**：将 O(n²) 的排斥力计算降至 O(n)
2. **边网格索引**：加速边与边的碰撞检测
3. **渐进式八方向吸附**：避免早期陷入局部最优
4. **温度衰减**：初期大步探索，后期精细调整
5. **增量更新**：只更新移动的节点相关数据

## 扩展方向

1. **更多评分方案**：支持不同风格的排版（欧式、日式等）
2. **交互式编辑**：支持手动调整后重新优化
3. **多区域支持**：处理多个城市的组合排版
4. **动画过渡**：展示排版过程的动画
5. **增量排版**：新增线路时局部更新而非全局重算

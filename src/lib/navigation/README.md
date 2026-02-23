# navigation

地铁导航路径计算模块。

## 功能说明

基于 Dijkstra 算法计算从起点到终点的最短综合路径，综合考虑步行距离和地铁行驶距离。**优先选择地铁出行**，通过给步行距离设置较高权重实现。

## 核心算法

1. **候选站点搜索** — 在起点/终点指定半径内查找候选地铁站
2. **邻接表构建** — 基于地铁线网构建图结构
3. **Dijkstra 最短路** — 对每个起点候选计算到所有站点的最短距离
4. **路径回溯与分段** — 重建路径并按线路分段展示

## 配置参数

- **candidateRadius** — 候选站点搜索半径（米），默认 3000
- **maxCandidates** — 每侧最多考虑的候选站点数，默认 5
- **walkWeight** — 步行距离权重，默认 5。计算总距离时步行距离会乘以该权重，使算法优先选择地铁出行

### 路径计算公式

```
总权重 = 步行到起点站距离 × walkWeight + 地铁行驶距离 + 步行离开终点站距离 × walkWeight
```

当 `walkWeight = 5` 时，算法会倾向于选择**更多乘坐地铁**的路线，即使这意味着：
- 更多步行距离
- 更多换乘

例如：
- 方案A：步行 500 米 + 地铁 2000 米 + 步行 500 米 = 权重 5000
- 方案B：步行 800 米 + 地铁 2500 米 + 换乘 + 地铁 500 米 + 步行 800 米 = 权重 6500（但地铁占比更高）

## 文件说明

- **dijkstra.js** — 最短路径计算核心实现

## 使用方式

```javascript
import { computeShortestRoute } from '@/lib/navigation/dijkstra'

const result = computeShortestRoute({
  stations: [...],
  edges: [...],
  lines: [...],
  originLngLat: [lng, lat],
  destLngLat: [lng, lat],
  candidateRadius: 3000,
  maxCandidates: 5,
  walkWeight: 5, // 步行距离权重，优先选择地铁
})

if (result) {
  // 导航可达
  console.log(result.totalMeters) // 总距离
  console.log(result.segments)     // 线路分段
} else {
  // 导航不可达（起点或终点周围无地铁站，或线网不连通）
}
```

## 返回值结构

```javascript
{
  originStationId: string,      // 起点站 ID
  destStationId: string,        // 终点站 ID
  edgeIds: string[],             // 经过的边 ID 列表
  stationIds: string[],         // 经过的站点 ID 列表
  walkToOriginMeters: number,    // 起点到起点站的步行距离
  walkFromDestMeters: number,    // 终点站到终点的步行距离
  transitMeters: number,         // 地铁行驶距离
  totalMeters: number,           // 总距离
  segments: [{                  // 线路分段
    lineId: string,
    lineName: string,
    lineColor: string,
    fromStation: string,
    toStation: string,
    fromStationId: string,
    toStationId: string,
    stationCount: number,
    distanceMeters: number,
  }]
}
```

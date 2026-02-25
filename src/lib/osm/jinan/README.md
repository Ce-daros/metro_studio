# lib/osm/jinan

济南地铁 OSM（OpenStreetMap）数据导入模块。从 Overpass API 获取原始数据，解析并构建标准化的地铁网络图结构。

## 功能概述

- 通过 Overpass QL 查询获取 OSM 地铁数据
- 解析 route relation、way 和 node 元素
- 构建加权邻接图并使用 Dijkstra 算法计算站点间路径
- 基于距离和名称进行站点合并（同站、换乘站识别）
- 输出标准化的工程数据结构

## 文件说明

| 文件 | 说明 |
|------|------|
| **constants.js** | Overpass QL 查询模板、济南行政边界几何、距离阈值、正则表达式 |
| **status.js** | 线路/站点状态判定（open/construction/proposed）及过滤逻辑 |
| **naming.js** | 线路名称规范化、环线检测、站名清理与标准化 |
| **topologyGraph.js** | 图算法实现：MinHeap、Union-Find、Dijkstra、邻接构建、坐标投影 |
| **topology.js** | 元素索引、邻接图构建、站点合并算法、拓扑重构 |
| **importer.js** | 主流程编排，对外暴露 `importJinanMetroFromOsm(options, signal)` 入口 |

## 核心 API

### `importJinanMetroFromOsm(options, signal)`

主入口函数，执行完整的导入流程。

**参数：**
```javascript
{
  includeConstruction: boolean,  // 是否包含建设中线路
  includeProposed: boolean,      // 是否包含规划中线路
  signal?: AbortSignal           // 可选的取消信号
}
```

**返回值：**
```javascript
{
  region: { id, name, relationId, bbox },        // 区域信息
  boundary: GeoJSON Polygon/MultiPolygon,         // 行政边界
  stations: Station[],                            // 站点数组
  edges: Edge[],                                  // 边数组
  lines: Line[],                                  // 线路数组
  importMeta: { timestamp, source, ... }          // 导入元数据
}
```

## 数据结构

### Station（站点）
```javascript
{
  id: string,                    // 唯一标识
  osmNodeId: number | null,      // OSM 节点 ID（可能为空）
  nameZh: string,                // 中文站名
  nameEn: string,                // 英文站名
  lngLat: [number, number],      // 地理坐标 [经度, 纬度]
  displayPos: [number, number],  // 画布坐标 [x, y]
  isInterchange: boolean,        // 是否为换乘站
  underConstruction: boolean,    // 是否建设中
  proposed: boolean,             // 是否规划中
  lineIds: string[]              // 所属线路 ID 列表
}
```

### Edge（边）
```javascript
{
  id: string,                     // 唯一标识
  fromStationId: string,          // 起点站 ID
  toStationId: string,            // 终点站 ID
  waypoints: [[number, number], ...], // 路径点（地理坐标）
  sharedByLineIds: string[],      // 共享此边的线路 ID
  lengthMeters: number            // 长度（米）
}
```

### Line（线路）
```javascript
{
  id: string,                     // 唯一标识
  key: string,                    // 去重键（如 "1"）
  nameZh: string,                 // 中文名称（如 "1号线"）
  nameEn: string,                 // 英文名称（如 "Line 1"）
  color: string,                  // 显示颜色（HSL）
  status: 'open' | 'construction' | 'proposed',
  isLoop: boolean,                // 是否为环线
  edgeIds: string[]               // 组成边的 ID 列表
}
```

## 算法详解

### 1. 站点合并算法

使用 **Union-Find（并查集）** 结合 **空间网格索引** 进行站点合并：

```javascript
// 合并阈值
const SAME_LINE_MERGE_THRESHOLD = 520;    // 同线路站点
const CROSS_LINE_MERGE_THRESHOLD = 320;   // 跨线路站点
const FORCE_MERGE_DISTANCE = 28;          // 强制合并距离

// 合并策略
1. 按标准化站名分组
2. 同组内使用 Union-Find 合并
3. 跨组基于距离阈值合并
4. 空间网格检测近距离站点强制合并
```

### 2. 路径计算

使用 **Dijkstra 最短路径算法** 计算相邻站点间的实际路径：

```javascript
// 1. 构建 OSM 路网的加权邻接图
// 2. 对每条线路的连续站点对运行 Dijkstra
// 3. 提取最短路径作为 edge.waypoints
// 4. 计算路径长度作为 edge.lengthMeters
```

### 3. 坐标投影

使用 **Web Mercator 投影** 将地理坐标转换为画布坐标：

```javascript
// 经纬度 → Mercator → 缩放至 1480px 画布
// Y 轴压缩系数 0.88
```

## 状态判定规则

### 线路状态
- `open`: 有 `route=subway` 且无 construction/proposed 标签
- `construction`: 有 `construction=railway` 或 `state=construction`
- `proposed`: 有 `proposed=railway` 或 `state=proposed`

### 站点状态
- 继承所属线路的状态
- 优先级：open > construction > proposed

## 依赖关系

```
importer.js
  ├── topology.js
  │   └── topologyGraph.js
  ├── naming.js
  ├── status.js
  └── constants.js

外部依赖：
  - @turf/bbox
  - @turf/helpers
  - @turf/boolean-point-in-polygon
  - ../overpassClient (Overpass API 客户端)
  - ../../ids (ID 生成工具)
  - ../../geo (地理坐标工具)
```

## 使用示例

```javascript
import { importJinanMetroFromOsm } from '@/lib/osm/jinan/importer.js';

const result = await importJinanMetroFromOsm({
  includeConstruction: true,
  includeProposed: false
});

console.log(`导入了 ${result.lines.length} 条线路`);
console.log(`导入了 ${result.stations.length} 个站点`);
console.log(`导入了 ${result.edges.length} 条边`);
```

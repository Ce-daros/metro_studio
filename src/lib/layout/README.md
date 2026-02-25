# lib/layout

布局模块的主线程侧，负责与 Web Worker 通信以执行耗时的自动排版计算。

## 功能概述

- 懒加载创建 Web Worker 实例
- 维护请求队列（支持并发调用）
- 封装 Worker 通信协议
- 为 Pinia Store 提供简洁的调用接口

## 文件说明

| 文件 | 说明 |
|------|------|
| **workerClient.js** | Worker 单例管理、请求队列维护、`optimizeLayoutInWorker()` 接口 |

## 核心 API

### `optimizeLayoutInWorker(payload)`

向 Worker 发送排版请求，返回 Promise。

**参数：**
```javascript
{
  stations: Station[],    // 站点数组
  edges: Edge[],          // 边数组
  lines: Line[],          // 线路数组
  config?: object         // 可选的排版配置覆盖
}
```

**返回值：**
```javascript
{
  stations: Station[],    // 更新了 displayPos 的站点
  score: number,          // 总体质量评分（越低越好）
  breakdown: {            // 评分分解
    angle: number,        // 八方向偏离
    length: number,       // 边长偏离
    overlap: number,      // 站点重叠
    crossing: number,     // 边交叉
    bend: number,         // 转弯惩罚
    shortRun: number,     // 短方向段
    geoDeviation: number, // 地理偏离
    labelOverlap: number  // 标签重叠
  },
  layoutMeta: {           // 排版元数据
    stationLabels: Map,   // 站点标签位置
    edgeDirections: Map   // 边方向
  },
  elapsedMs: number       // 计算耗时
}
```

## 数据流

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  主线程 (Main Thread)                                                        │
│                                                                              │
│  Pinia Store: stores/project/actions/importLayout.js                        │
│    │                                                                        │
│    │  runAutoLayout()                                                       │
│    ▼                                                                        │
│  lib/layout/workerClient.js                                                 │
│    │  optimizeLayoutInWorker(payload)                                       │
│    │  ┌──────────────────────────────────────────────────────────────────┐  │
│    │  │ 请求队列管理                                                      │  │
│    │  │ - requestId 生成                                                 │  │
│    │  │ - Promise 挂起                                                   │  │
│    │  └──────────────────────────────────────────────────────────────────┘  │
│    │                                                                        │
├────┼────────────────────────────────────────────────────────────────────────┤
│    │  Worker Message                                                        │
│    │  { requestId, payload }                                               │
│    ▼                                                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  Web Worker: workers/layoutWorker.js                                    ││
│  │    │                                                                    ││
│  │    │  self.onmessage                                                    ││
│  │    ▼                                                                    ││
│  │  workers/layout/optimizeLayout.js                                       ││
│  │    │                                                                    ││
│  │    │  ┌──────────────────────────────────────────────────────────────┐  ││
│  │    │  │ 自动排版算法 (详见 workers/layout/README.md)                 │  ││
│  │    │  │ - 力导向布局                                                 │  ││
│  │    │  │ - 八方向约束                                                 │  ││
│  │    │  │ - 线路方向规划                                               │  ││
│  │    │  │ - 标签放置                                                   │  ││
│  │    │  │ - 质量评分                                                   │  ││
│  │    │  └──────────────────────────────────────────────────────────────┘  ││
│  │    │                                                                    ││
│  │    │  result                                                            ││
│  │    ▼                                                                    ││
│  │  postMessage({ requestId, ok: true, result })                          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│    │                                                                        │
│    │  Worker Message                                                        │
│    │  { requestId, ok, result }                                            │
│    ▼                                                                        │
│  Promise resolve(result)                                                    │
│    │                                                                        │
│    │  返回结果给 Store                                                      │
│    ▼                                                                        │
│  Store 更新:                                                                │
│    - project.stations (更新 displayPos)                                     │
│    - project.layoutMeta                                                     │
│    - project.snapshots (保存快照)                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Worker 单例模式

```javascript
// workerClient.js 实现要点

let workerInstance = null;
let pendingRequests = new Map();

function getWorker() {
  if (!workerInstance) {
    workerInstance = new Worker(new URL('../../workers/layoutWorker.js', import.meta.url));
    workerInstance.onmessage = handleWorkerMessage;
    workerInstance.onerror = handleWorkerError;
  }
  return workerInstance;
}

function handleWorkerMessage(e) {
  const { requestId, ok, result, error } = e.data;
  const { resolve, reject } = pendingRequests.get(requestId);
  pendingRequests.delete(requestId);
  ok ? resolve(result) : reject(error);
}
```

## 错误处理

Worker 侧的错误会被捕获并封装成标准响应：

```javascript
// Worker 返回错误格式
{
  requestId: string,
  ok: false,
  error: {
    message: string,
    stack?: string
  }
}

// workerClient.js 会 reject Promise
throw new Error(error.message);
```

## 使用示例

```javascript
import { optimizeLayoutInWorker } from '@/lib/layout/workerClient.js';

// 在 Pinia action 中使用
async function runAutoLayout() {
  const payload = {
    stations: this.stations,
    edges: this.edges,
    lines: this.lines,
    config: this.layoutConfig  // 可选
  };

  const result = await optimizeLayoutInWorker(payload);

  // 更新站点显示位置
  this.stations = result.stations;

  // 保存评分和元数据
  this.layoutMeta = result.layoutMeta;

  // 创建快照
  this.snapshots.push({
    createdAt: Date.now(),
    score: result.score,
    breakdown: result.breakdown
  });
}
```

## 依赖关系

```
lib/layout/workerClient.js
  → ../../workers/layoutWorker.js (动态 import)
```

**被调用方：**
- `src/stores/project/actions/importLayout.js`

## 注意事项

1. **单例 Worker**：整个应用只创建一个 Worker 实例，所有请求排队处理
2. **不可取消**：当前实现不支持中途取消排版任务
3. **序列化开销**：大数据量时，序列化/反序列化 payload 可能成为瓶颈
4. **错误隔离**：Worker 内部错误不会导致主线程崩溃

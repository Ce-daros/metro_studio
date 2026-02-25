# workers

Web Worker 计算任务模块。将耗时的 CPU 密集型计算移至 Worker 线程，避免阻塞主线程 UI。

## 功能概述

- 接收主线程发送的计算请求
- 调用排版算法执行计算
- 处理错误并返回结果
- 封装消息通信协议

## 文件说明

| 目录/文件 | 说明 |
|-----------|------|
| **layoutWorker.js** | Worker 入口文件，处理消息收发、错误封装 |
| **layout/** | 自动排版算法实现（详见 `layout/README.md`）|

## 通信协议

### 请求格式

```javascript
{
  requestId: string,   // 唯一请求标识
  payload: {
    stations: Station[],
    edges: Edge[],
    lines: Line[],
    config?: object    // 可选配置覆盖
  }
}
```

### 成功响应

```javascript
{
  requestId: string,
  ok: true,
  result: {
    stations: Station[],
    score: number,
    breakdown: object,
    layoutMeta: object,
    elapsedMs: number
  }
}
```

### 错误响应

```javascript
{
  requestId: string,
  ok: false,
  error: {
    message: string,
    stack?: string
  }
}
```

## Worker 入口实现

```javascript
// layoutWorker.js

import { optimizeLayout } from './layout/optimizeLayout.js';

self.onmessage = async (event) => {
  const { requestId, payload } = event.data;

  try {
    const result = await optimizeLayout(payload);
    self.postMessage({ requestId, ok: true, result });
  } catch (error) {
    self.postMessage({
      requestId,
      ok: false,
      error: {
        message: error.message,
        stack: error.stack
      }
    });
  }
};
```

## 依赖关系

```
layoutWorker.js
  └── layout/optimizeLayout.js
      ├── config.js
      ├── forces.js
      ├── constraints.js
      ├── linePlanning.js
      ├── labels.js
      │   └── labelPlacement.js
      ├── scoring.js
      ├── chineseStyleScoring.js
      └── shared.js
```

## 使用方式

Worker 由主线程通过 `lib/layout/workerClient.js` 懒加载创建：

```javascript
// 主线程侧
const worker = new Worker(new URL('./layoutWorker.js', import.meta.url));
worker.onmessage = (e) => { /* 处理响应 */ };
worker.postMessage({ requestId, payload });
```

## 注意事项

1. **文件导入**：Worker 内使用 ES Module 导入，需要构建工具支持（Vite 已配置）
2. **调试限制**：Worker 内无法使用 DevTools 断点调试，依赖 console.log
3. **内存隔离**：Worker 无法访问主线程变量，所有数据通过消息传递
4. **序列化开销**：大数据量时，结构化克隆可能成为性能瓶颈

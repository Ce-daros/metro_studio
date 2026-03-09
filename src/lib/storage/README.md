# lib/storage

工程持久化与文件读写。项目元信息中的 `meta.createdAt` / `meta.updatedAt` 在读取与标准化时会尽量保留原值，只在缺失时回退为当前时间。

## 文件说明

- **db.js** — IndexedDB 初始化（`railmap-db`），工程保存/加载/列表/删除/最近项目指针。保存前执行可序列化投影（去响应式代理，规整数值/数组），包含排版参数预设列表、当前激活预设 ID，以及共线段按线路保存的 `lineTimeline`。
- **projectFile.js** — 工程 JSON 序列化，本地下载 `.railmap.json`，解析导入文件并标准化为内部模型；工程文件会携带排版参数预设

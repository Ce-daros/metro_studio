# stores

Pinia Store。

## 文件说明

- **projectStore.js** — Store 入口与聚合层（state/getters/actions 组合），维护线段多选状态（`selectedEdgeIds`）、编辑上下文（`currentEditYear` + `currentEditPhase`）和撤销/重做能力（`canUndo`/`canRedo`）。通过对象展开整合 `project/actions/*`。
- **project/** — `helpers.js` 和 `actions/` 子模块，详见 `project/README.md`

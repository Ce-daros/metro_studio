
## 6. 潜在的性能问题

### 6.1 同步大文件操作

**文件**: `src/lib/storage/db.js`
- **问题**: IndexedDB操作未考虑大项目性能
- **类型**: 简化逻辑
- **建议**:
  - 对大项目实现分块保存
  - 添加进度回调

### 6.2 重复计算

**文件**: `src/lib/timeline/timelinePreviewStateMachine.js:436-480`
- **问题**: 每帧重新计算统计数据
```javascript
_computeStatsAtProgress(globalProgress) {
  // 每帧遍历所有segments
}
```
- **类型**: 简化逻辑
- **建议**:
  - 缓存计算结果
  - 使用增量更新

---

## 7. 安全问题


### 7.2 XSS风险

**文件**: `src/components/TimelineEventEditor.vue:173`
- **问题**: 使用 `v-html` 或直接渲染用户文本
```javascript
ctx.fillText(station.nameZh || '', labelX, py - fontSize * 0.3)
```
- **类型**: 简化逻辑
- **建议**:
  - 在 Canvas 渲染前转义特殊字符
  - 考虑使用文本库而非直接 fillText

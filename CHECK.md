# 版本发布工作流

## 发布前检查

1. **查看代码变更统计**
   ```bash
   git diff HEAD~1 --stat
   ```

2. **查看具体代码变更**
   ```bash
   git diff HEAD~1 <具体文件路径>
   ```

3. **分析变更类型并决定版本号**
   - `MAJOR`：不兼容的 API 变更（破坏性改动）
   - `MINOR`：向后兼容的功能性变更（新增功能）
   - `PATCH`：向后兼容的问题修复、改进、重构

## 更新版本

1. **更新 package.json**
   - 根据变更类型递增版本号
   - 如果是预发布版本，使用 `-rc.1`, `-rc.2` 等后缀

2. **更新 CHANGELOG.md**
   - 在文件开头添加新版本记录
   - 按 `### 新功能` / `### 改进优化` / `### 问题修复` 分类
   - 每条变更使用 `-` 开头
   - 与上一版本之间用 `---` 分隔

3. **提交并推送**
   ```bash
   git add CHANGELOG.md package.json
   git commit -m "chore: bump version to X.Y.Z"
   git push
   ```

## Commit Message 规范

根据变更类型使用对应前缀：

- `feat:` 新功能
- `fix:` 问题修复
- `improve:` 改进优化
- `refactor:` 重构
- `chore:` 构建/工具/文档变更

示例：
- `feat: add video demo system, activation code menu, optimize map rendering`
- `fix: improve map layer visualization and icon rendering`
- `chore: bump version to 0.47.0-rc.3`

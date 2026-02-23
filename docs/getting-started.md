# 快速开始

## 在线使用

直接访问 [metro-studio-iota.vercel.app](https://metro-studio-iota.vercel.app/)，无需安装。

## 本地运行

```bash
# 克隆仓库
git clone https://github.com/Ce-daros/railmap.git
cd railmap

# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build
```

## 基本操作

1. **添加站点**：在地图上点击即可添加站点
2. **连接线路**：拖拽站点之间的连线
3. **编辑属性**：选中站点或线路，在右侧面板编辑名称、颜色等属性
4. **生成示意图**：切换到示意图视图，自动生成规整的线路图
5. **导出**：菜单栏 → 导出大图、分享小图（全网）或官方风格图

## AI 功能配置

如需使用 AI 自动命名功能：

1. 打开菜单栏 → 设置 → AI 配置
2. 填写 API Base URL（支持 OpenAI 兼容 API）
3. 填写 API Key
4. 保存配置

配置完成后，选中站点即可使用 AI 自动生成中英文站点名称。

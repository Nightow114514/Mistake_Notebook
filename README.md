# 错题笔记本

本地截图/错题管理工具。导入图片、多级标签分类、按标签筛选、随机抽取、导出 PDF。

## 功能

- **拖拽导入** — 从资源管理器拖图片到窗口即可导入，支持 PNG / JPG / WebP / BMP / GIF
- **多级标签** — 父子层级标签系统，树形展示、可折叠，子标签随父标签折叠
- **标签筛选** — 按一个或多个标签取交集筛选，选父标签自动包含所有子标签结果
- **随机抽取** — 从当前结果中随机抽取 N 张，单独弹窗展示
- **PDF 导出** — 多选（或全选）图片导出为 PDF，每图一页、自适应 A4 页面
- **双击预览** — 双击图片全屏预览，键盘 ←→ 切换上/下一张
- **多选模式** — Ctrl + 点击单选、Shift + 点击范围选择
- **深色模式** — 一键切换深色/浅色主题，持久化保存
- **自定义存储** — 可设置截图保存目录，默认存于用户数据目录

## 技术栈

| 层面 | 技术 |
|---|---|
| 桌面框架 | Electron 35 |
| 数据库 | SQLite (sql.js WASM) |
| PDF 导出 | pdf-lib |
| 前端 | 原生 HTML / CSS / JS，无框架 |

## 项目结构

```
├── main.js           # Electron 主进程：窗口、IPC、文件操作
├── preload.js        # contextBridge 安全暴露 API
├── database.js       # SQLite 数据库初始化及全部查询
├── settings.js       # 设置持久化（JSON 文件）
├── renderer/
│   ├── index.html    # 主界面
│   ├── style.css     # 样式（CSS 变量驱动，支持深色模式）
│   └── renderer.js   # 前端逻辑（原生 JS）
└── package.json
```

## 数据库

三张表：

```
images      — id, filename, original_name, file_path, file_size,
              width, height, format, created_at

tags        — id, name, color, parent_id, created_at

image_tags  — image_id, tag_id (联合主键，级联删除)
```

## 开发

```bash
# 安装依赖
npm install

# 启动应用
npm start
```

Node.js ≥ 24，Windows 系统。

## License

MIT

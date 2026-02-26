# SafeEYE (SafeSpot-Local) 架构蓝图与反引力解耦

## 核心设计理念：本地结构化数据库 (Structured Local DB)

为了提升数据查询效率与系统稳定性，SafeEYE 已从早期的“全文本 JSON 存储”进化为**基于 SQLite 的结构化存储架构**。这在保持“数据不出本地、零网络依赖”的同时，提供了物理级的事务保护。

### 1. 结构化数据底座 (SQLite 3)
系统的一切核心业务数据（图片元数据、标注坐标、考卷生成逻辑、用户成绩）全部收拢进单一的物理数据库文件 `/server/data/safeeye.db`。
* **物理隔离**：图片资产依然保留在 `/assets/raw/` 以方便人工直接预览。
* **逻辑统一**：数据库通过 `id` 索引物理文件，并利用 5 张核心表（assets, annotations, exams, exam_items, records）维护极其复杂的业务映射。

### 2. 反引力解耦的延续
尽管引入了 SQL，但我们依然坚持：
* **零配置启动**：使用 C 语言编写的 `better-sqlite3` 后端驱动，无需安装 MySQL 等独立进程。
* **一键拷贝**：只要拷贝整个工程目录，数据库文件随包带走，实现了真正的“反引力”自包含。

## 数据流处理架构

```text
[浏览器前端 - Vite React]
      |
      | - 1. Request (/api/assets): "获取图片列表与关联标注"
      | - 2. Request (/api/admin/db/query): "对账：透视物理表内容"
      v
[Node.js 高性能后端 - Express + SQLite]
      |
      | -> SQL Query -> [safeeye.db / assets 表]
      | -> SQL Query -> [safeeye.db / annotations 表]
      | -> fs.static  -> [静态目录 /data/assets/raw/*.jpg]
```

## 视图呈现控制架构

前端通过百分比记录所有坐标。`x_ratio` 和 `y_ratio`。无论是 4K 屏幕还是 iPad 预览，前端只做一件事：
`left: img.clientWidth * x_ratio, top: img.clientHeight * y_ratio`。完美抹平台设备分辨率差异，不再依赖固定尺寸计算。这也是“坐标转换”的核心引擎价值。

## Frontend 状态解耦机制 (Top-Down State Flow)

在多组件协同（如“左侧画布与右侧列表联动”、“组卷大厅强起考试屏”）的场景下，SafeEYE 坚守**单向数据流**设计哲学，拒绝引入 Redux 等重型状态管理的包袱。
1. **统一根节点提权 (Lifting State Up)**：
   在 `App.jsx` 顶层统一把控 `activeExamId`、`autoStartExamId` 等指令中心，通过 Props 跨组件向下击穿分发。
2. **状态驱动的同源视图 (Single Source of Truth)**：
   使用唯一识别码（例如 `hoveredAnnoId`），不论是鼠标移入左侧图形气泡，还是滑过右侧属性清单面板，唯一的事件出口都会回传给父节点去修改这一公理级 ID，从而驱动全屏关联节点实现“双向发光联动”的量子纠缠效应。

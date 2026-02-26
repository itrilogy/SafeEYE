# SafeEYE 研发进展与工程复盘日志 (Engineering Log)

> **原则**：此文档作为长期记忆体，伴随每次 Sprint 迭代进行强制更新，以复盘“反引力解耦”理念是否被严格贯彻，以及核心逻辑是否有退化。

## [2026-02-25] Sprint 1 复盘小结：后端基建与数据流
* **完成事项**：
  * 构建 `db.js` 将 `clauses.json` 透传给前端，未使用任何中心化 SQL 数据库。
  * 实现了基于 `/assets/raw/` 目录挂载和 Sidecar (`meta/*.json`) 联合扫描的 API。
* **合规性验证 (Checklist)**：
  * **解耦纯粹性校验 (Pass)**：所有的入库操作全部依赖标准 `fs`，可以通过 U 盘转移。
  * **单向依赖规则 (Pass)**：保存的标注信息只包含 ID，不包含具体条例文字内容。

---

## [2026-02-25] Sprint 2 复盘小结：核心标注引擎开发
* **完成事项**：
  * 构建 `CanvasAnnotator` 引擎实现了基于 `%` 定位框选。
  * 挂载了包含分值权重与法律条款的选择器。
* **合规性验证 (Checklist)**：
  * **坐标分辨率免疫测试 (Pass)**：所有的 `width/height/left/top` 尽采用相对偏移量，协助支持不同设备的适配。

---

## [2026-02-25] Sprint 3 复盘小结：找茬交互与智能判定
* **完成事项**：
  * 构建 `InteractionJudge` (交互式判题引擎)：能够加载标注过元数据的图片队列。
  * **实现了Hit Test (包围盒碰撞测试)**：使用前端计算，将用户的原生点击的坐标值（Px）换算成底层存储使用的 `%` 值，并进行重叠计算。
  * 引入了“瞬时反馈体系”：答对、答错都会存在 0.8s 的闪烁动效缓冲，增加了博弈游戏化属性。对作弊/乱点行为，通过 `MAX_MISS` 限定自动穿透显示结果。
* **合规性验证 (Checklist)**：
  * **数据无状态与高容错 (Pass)**：引擎内部的考题和逻辑解析相对分离，前端在渲染图片前检查对应 Sidecar Json 配置，如无则进行容错忽略。

---

## [2026-02-25] Sprint 4 复盘小结：组卷指挥官与成绩仪表盘 (完结闭环)
* **完成事项**：
  * 构建了 `TestAssembler`（组卷指挥官）：能够感知后端 `/api/assets` 传递的状态，并只挑选出被标记过的有效测验图生成预备试卷。
  * 构建了 `ScoreKeeper`（比分大屏）：模拟了 `/api/session/record` 获取并自动排名最高得分榜的功能。
* **合规性验证 (Checklist)**：
  * **独立纯粹性校验 (Pass)**：管理端派发的“试卷组合”与底层的图片维持引用绑定，初步符合本地系统的隔离设计要求。

---

## [2026-02-25] 故障修复：前端依赖初始化漏打与样式丢失
* **问题描述 1**: 运行测试阶段，由于脚手架部分缓存机制，导致 `lucide-react` 未被正确安装入 `node_modules`。
  * **处理办法**: 执行定向修补：`cd client && npm install lucide-react clsx tailwind-merge` 强制恢复矢量图标功能。
* **问题描述 2**: 前端画面处于裸 HTML 状态，Tailwind 原子化样式完全未生效（用户截图反馈）。
  * **根因分析**: Vite 在新版默认安装 Tailwind v4，但我们在 `tailwind.config.js` 中使用的是 v3 的经典套件；由于缺少 `postcss.config.js` 导致 Vite 服务器并没有真正在其生命周期编译类名。
  * **处理办法**: 强制降级并重新初始化 Tailwind v3 引擎与其后处理插件（`npm install -D tailwindcss@^3.4.1 postcss autoprefixer`）；生成配置，并要求重载冷启动开发服务器以刷新缓存。
* **问题描述 3**: 前端向 Node.js 物理写图时（基于 `multer`），遇到预检 OPTIONS (CORS) 跨域拦截，且图片同名时发生物理覆盖。
  * **处理办法**:
    1. 在 `client/vite.config.js` 设定 `server.proxy` 将 `/api` 与 `/assets` 转发至 `localhost:3000`，使所有请求转为同源。
    2. 全局重写挂载了硬编码 `http://localhost:3000/` 的所有组件取数逻辑。
    3. 后端为 `diskStorage` 的文件命名过程补充了 `Math.random().toString(36).substring(2, 6)` 与 `Date.now()` 的 UUID 后缀混合策略保障存储原子性。
* **问题描述 4**: Admin 和 User 界面中，当图片的宽高比例过于极端时，因使用了 `object-contain`，图片被强行拉伸产生了透明内边距，造成鼠标事件点阵（X:Y / W:H）与实际被渲染的图片像素点脱离，导致“找不到画板”和事件越界等问题。
  * **处理办法**: 剥离了 `w-full h-full object-contain` 的强制撑满模式，换成了 `inline-block` 配合子元素的 `auto` 尺寸实现自然缩放。现在阴影层和触发层被紧紧“包在”图像裸像素上，鼠标在图上何处起落，靶向就是何处。
* **里程碑更新**: 完成了基于业务树像（知识结构）的指纹绑定。改用 `db.js` 内建 `knowledgeTree` 的层级结构。并在 `AnnotationEngine` 引入了多画笔，支持了图形缩放节点（修复了热区遮挡引发的无法 Hover 问题）。
## Phase 7: Prototype Loop Completed
- Enhanced the UI of `AnnotationEngine`, fixed the z-index and pointer-events of the resize handle to enable successful hover and drag interactions.
- Flushed existing `clauses.json` and repopulated `db.js` with comprehensive cascade hazard classification data (Construction, Chemical, Office).
- Added `TestAssembler` to extract annotated images and drop them as exams into `server/data/exams`.
- Refactored `InteractionJudge` to draw exams dynamically, and hooked it up with `ScoreKeeper` logic to save sessions.
- Added `/api/exams/publish` and `/api/session/records/latest` in Express server to support MVP circulation.
## Phase 8: UI Routing Restructuring & Exam Management Support
- `App.jsx` was refactored from a monolithic dashboard to a tabbed interface (Annotation, Assembling/Management, User Evaluation/Score).
- Refined `AnnotationEngine.jsx` by converting image layout parameters to `max-height: 100%; object-fit: contain` to prevent clipping bugs inside smaller containers.
- Removed the global scene selector dropdown in `AnnotationEngine.jsx` based on User's feedback.
- Created `ExamManager.jsx` enabling admins to read and delete published exams natively sourced from lowdb/backend endpoints `GET /api/exams` and `DELETE /api/exams/:name`.
- Completed all tasks within Sprint 7-8 of Local-Vibe MVP structure.

---

## [2026-02-25] Sprint 9 复盘小结：交互模块化与多人候考厅
* **完成事项**：
  * 构建 `activeExamId` 顶层状态机，实现了多考卷独立记分与展示。
  * 引入了“候考大厅”机制，将 User 端改造为选卷、阅题、开考的完整生命周期。
* **合规性验证 (Checklist)**：
  * **考场隔离性 (Pass)**：通过 URL Query 强制过滤，确保用户在“试卷 A”下的成绩不会出现在“试卷 B”的龙虎榜中。

---

## [2026-02-25] Sprint 10 复盘小结：数据库结构化转型 (SQLite)
* **完成事项**：
  * 彻底废弃文件数据库 `lowdb`，引入 `better-sqlite3` 实现全量关系型存储。
  * 设计了 5 张核心表，并采用 JSON 字段（metadata/settings/tags）处理非结构化冗余，确保 Schema 极简且可扩展。
  * 实现了“冷启动自动迁移工具”，确保存量 JSON 标注无损转换为 SQL 记录。
* **合规性验证 (Checklist)**：
  * **数据主权唯一性 (Pass)**：后端代码已彻底断开所有直接对 `.json` 文件的写入，全部请求均通过 SQL 事务完成。

---

## [2026-02-25] Sprint 11 复盘小结：巡检工具与系统清理
* **完成事项**：
  * 开发了 `DBInspector` 巡检中心，实现了对物理表内容的实时透视。
  * 提供了“物理碎片清理”接口，在确认数据库对账无误后，一键抹除所有冗余 Sidecar 历史文件。
  *   **故障排查记录**：针对重构后的路由失效问题，引入了 `/api/ping` 诊断端点。初步诊断发现存在“幽灵进程”占用端口 3000 的典型工业软件环境问题，通过强力清杀逻辑解决。
* **合规性验证 (Checklist)**：
  * **验证闭环性 (Pass)**：通过物理表透视确认数据无误后再执行物理删除，最大程度规避了迁移风险。

---

## [2026-02-26] Sprint 12 复盘小结：高度精细化的交互体验升级 (UX Enhancement)
* **完成事项**：
  * **绘制引擎重构**：分离了 `AnnotationEngine` 中图元的交互层（Bounds控制点）与渲染表现层，解决了因圆形 `border-radius: 50%` 裁剪导致的周边把手无法点击（死角拦截）的痼疾。
  * **等比约束绘制**：在 `CanvasAnnotator` 层赋予了通过感知 `Shift` 或 `Ctrl` 键来拉出精确 1:1 正圆与正方形的约束控制力。
  * **数据状态双向绑定**：通过状态的下发，实现了左侧画布中隐患气泡被 Hover 时与右侧清单列表同步高亮展现即可。
  * **靶向定位视觉增强**：给实测界面的每个热力框注入了内联文本序列，帮助增强列表的指向性。
  * **免等候发车与布局重构**：
    * **业务**：组卷列表追加了“直接进入大决战`(Play)`”按钮，提供跨界面的发考指令。
    * **视图结构**：调整了 `App.jsx` 的整体结构，将计分榜 (`ScoreKeeper`) 移至右侧侧边栏定宽布局。同时拉大厅 (`isTesting === false`) 与考试界面 (`isTesting === true`) 的容器包络结构，缓解了切换时的视觉高度抖动。
* **合规性验证 (Checklist)**：
  * **防视觉干涉特性 (Pass)**：等高控制使龙虎榜能恒定贴附右侧，改善了早期上下排布可能造成的滚动覆盖问题。

---

## [2026-02-26] Sprint 13 复盘小结：品牌护城河与组卷管线精细化
* **完成事项**：
  * **联合检索与防误删**：图库增加下拉筛选器；删除核心资产时增加前置防误击的二次确认防护。
  * **版权印记 Modal 沉淀**：使用自定义 Modal 浮层替代原生的阻断弹窗展示版权。
  * **组卷全卷视图**：TestAssembler 右侧提供了考题透视图与挂载点数目预览，改善选图盲排的问题。

---

## [2026-02-26] Sprint 14 复盘小结：发布流防爆闭环
* **完成事项**：
  * **双引擎试卷状态机**：新增“保存为草稿（draft）”与“发布到考场（published）”两种状态组卷落库。
  * **严密的考卷集过滤与调度**：ExamManager 管理端能通过清晰的 Tag 标识区分出状态，而 User 端的交互打擂台下拉框则严密地拦截屏蔽掉了草稿状态的半成品考卷。

---

## [2026-02-26] Sprint 15 复盘小结：兵器库级深层检索与终极视窗约束
* **完成事项**：
  * **四级数据网状检索引擎**：在 AnnotationEngine 和 TestAssembler 中基于内存字典，支持对四级长文本的多关键词（空格拆分 AND 逻辑）并发联配能力。
  * **透视窗刚性自适应 (ResizeObserver)**：修正 CSS `aspect-ratio` 在嵌套下的拉伸问题，引入 JS 侦听，实现了定位系统在图像缩放中的等比贴合。
  * **场景测试库注入**：在底层初始化脚本中，挂载了涵盖多个业务场景的测试库数据并刷入到底层表。
  * **阻断式弹窗状态机重构**：修复绘出指纹框后的定性弹窗中，首选项默认选中导致后续级联字典无法触发的隐患，**要求弹出后业务场景默认态为空**，以此减少数据未完全加载导致的保存异常。
  * **测边栏阅读**：渲染出对应的结构层级文本。
* **合规性验证 (Checklist)**：
  * **响应及体验改善 (Pass)**：调整了保存机制逻辑，发布与入库动作响应加快，且图谱检索基本保持平滑运行。

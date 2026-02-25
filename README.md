# 🛡️ SafeEye (safe-eye-pro)

> **基于“找不同”机制的交互式安全合规应知应会平台**
>
> **Design Philosophy:** 
> 这是一个旨在消除安全培训枯燥感的“反引力”工程。通过将合规条款转化为视觉博弈，让风险识别成为直觉。项目采用本地 NoSQL 架构，实现极致的轻量化与数据主权。

---

## 📖 产品意图 (Product Intent)

**SafeEye** 重新定义了安全合规学习。它不再是枯燥的 PPT 阅读，而是一个**“视觉反馈引擎”**：
1. **实景重构：** 采集真实的生产现场图片（`ori_pic`）。
2. **知识解构：** 通过管理端将法律法规、行业标准“缝合”到图片的具体坐标点上。
3. **沉浸博弈：** 用户在“找茬”的过程中，通过点击反馈实时获取关联的合规知识。

---

## 🏗️ 整体规划与工程架构 (Engineering Blueprint)

### 1. 存储架构：Local-First NoSQL
项目放弃传统数据库，采用 **文件系统即数据库** 的设计：
*   **Asset Sidecar (边车模式):** 每张图片 `A.jpg` 对应一个 `A.json`。
*   **Decoupled Schema:** 条款库、场景库、成绩库均为独立的 JSON 文件，互不干扰。

### 2. 空间定位：Relative Positioning Engine (RPE)
*   **零摩擦适配：** 所有标注坐标均以 `(x_ratio, y_ratio)` 存储。
*   **响应式判定：** 无论在 4K 屏幕还是平板电脑，判定逻辑自动根据容器宽高计算像素偏移，确保点击精度。

### 3. 业务流：从“隐患点”到“试卷视图”
*   **管理端：** 实现 Canvas 画布操作，拖拽即生成 `Spot`（隐患点），实时关联 `Clause`（条款）。
*   **组卷逻辑：** 采用“标签匹配算法”，支持根据业务场景（如：高空作业、实验室）自动聚合题目。

---

## 📂 文件夹结构 (Directory Structure)

```bash
safe-eye-pro/
├── data/                  # 本地存储中心 (Local NoSQL)
│   ├── assets/            # 图片资源
│   │   ├── raw/           # 原始现场图片 (ori_pic)
│   │   └── meta/          # 图片元数据 (标注坐标、关联条款 ID)
│   ├── knowledge/         # 合规知识库
│   │   ├── clauses.json   # 安全标准、法律条款明细
│   │   └── scenes.json    # 业务场景分类
│   ├── exams/             # 测试活动配置
│   └── records/           # 用户得分与详细点击行为记录
├── src/
│   ├── admin/             # 管理端模块 (标注引擎、组卷器)
│   ├── player/            # 用户端模块 (交互判题、成绩单)
│   ├── engine/            # 核心逻辑 (RPE坐标计算、判题机)
│   └── shared/            # 通用 UI 组件与文件读写层
└── README.md
```

---

## 🛠️ 功能特性 (Feature Set)

### 管理端 (Command Center)
- **资产中心：** 支持 `ori_pic` 的快速导入与批量管理。
- **视觉标注：** 
    - 鼠标拖拽式绘制（圆/方），支持相对坐标自动转换。
    - 强制语义绑定：标注时必须勾选不符合项类型、关联条款。
- **动态组卷：** 
    - 智能模式：按场景、难度、数量自动抽题。
    - 精细化微调：手动设置每题分值、容错点击次数、答案可见性。
- **分析看板：** 查看参与者得分排行及详细的错题分布。

### 用户端 (Interaction Terminal)
- **极简准入：** 姓名、手机、部门快速登记，即刻开测。
- **博弈体验：** 
    - 找不同机制：点击命中后即刻弹出合规解析。
    - 熔断机制：超过点击上限自动揭晓答案，强化记忆。
- **即时反馈：** 测试结束自动计算得分、位次及等次（优/良/中/差）。

---

## 🚀 开发与部署 (Vibe-Style Deployment)

### 技术栈
- **Frontend:** React / Next.js (Fast & Responsive)
- **Local DB:** Lowdb / Native File System API
- **Canvas Library:** React-Konva 或原生 Canvas API
- **Styling:** Tailwind CSS

### 运行与拉起服务 (How to Run)

> **[重要通知]** 本项目基于“反引力架构”，后端（提供本地文件读写引擎）与前端（提供视觉交互视图）是完全解耦的实体，因此您需要 **两个终端窗口** 分别运行它们。

**第一步：启动数据支撑基座 (Backend Server)**
1. 打开第一个终端窗口。
2. 进入后端目录：`cd server`
3. 安装依赖：`npm install`
4. 启动服务：`npm run start` （将挂载于 http://localhost:3000）

**第二步：启动视觉表现引擎 (Frontend Client)**
1. 打开第二个独立的终端窗口。
2. 进入前端目录：`cd client`
3. 安装依赖：`npm install`
4. 启动画面：`npm run dev` （将挂载于 http://localhost:5173 且具备跨域代理连通能力）

等待编译完成，所有数据将通过 Axios 从 `server/data` 读写流转。

---

## 🛡️ 安全与合规说明
*   **数据隐私：** 采用本地存储，所有测试记录和原始图片均不上传云端。
*   **标准同步：** 修改 `data/knowledge/clauses.json` 即可全局更新最新的国家标准，无需修改业务代码。

---
*Created by SafeEye Engineering Team with Vibe Coding Philosophy.*
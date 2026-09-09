# 工作台项目素材核验（2026-09-09）

只核验公开 GitHub README、代码和公开演示入口。未读取本机账户资料、账本记录、订单原始数据，未运行任何项目。GitHub API 匿名额度已耗尽，README 和代码通过 raw.githubusercontent.com 成功读取；在线页面用 HTTP 请求核验，未启动浏览器。

## personal-asset-cost-tracker

建议中文短名：**资产日均成本**（完整原名：大件资产日均成本追踪器）。类型：生活工具 / 个人应用。

两句概述：把日常消费和大件资产放进同一份账本，按年份与分类查看支出。将消费标记为追踪资产后，可以查看日均持有成本，并通过结算日归档或恢复追踪。

三个事实模块：
1. 录入名称、金额、分类和购入日期，按年份或分类筛选账本。
2. 开启资产追踪，显示总投入、持有天数与日均成本。
3. 选择结算日归档，锁定日均成本；恢复后重新按今天计算。

公式已核对源码：`dailyCost = roundCurrency(amount / daysHeld)`；`daysHeld = max(1, floor((UTC(endDate)-UTC(purchaseDate))/86400000)+1)`，包括购入当天与结算当天。进行中资产的结算日为本地今天；归档后用保存的 `endDate`。四舍五入到两位小数。恢复追踪清空结算日，仍从原购入日期计数，并非重新从零计时。结算日不可早于购入日。

没有“卖出价”“残值”“卖出收入”字段，不应使用 `(购入价-出售所得)/持有天数` 或宣传自动扣除残值。适合在工作台做一个空白/合成样例的独立日均成本计算器；明确是演示样例，不导入真实账本。

来源：
- https://github.com/1205240810/personal-asset-cost-tracker/blob/main/README.md
- https://github.com/1205240810/personal-asset-cost-tracker/blob/main/src/store/transactions.ts （getAssetMetrics / archiveAsset / unarchiveAsset）
- https://github.com/1205240810/personal-asset-cost-tracker/blob/main/src/utils/date.ts （getInclusiveDayCount）
- https://github.com/1205240810/personal-asset-cost-tracker/blob/main/src/utils/format.ts （roundCurrency）
- https://github.com/1205240810/personal-asset-cost-tracker/blob/main/src/types/transaction.ts （数据字段，无残值）

在线演示：README 只有 Expo 本地预览与 localhost:8082；同名 GitHub Pages 返回 404。可写“未找到公开在线演示”，不要写“无在线演示”（并未穷举所有部署）。

## campus-delivery-algorithm-presentation

建议中文短名：**校园配送调度**（课题原名：校园外卖最小配送人员问题）。类型：算法实验 / 课程项目。

两句概述：将校园路网建成加权图，结合订单时间窗和载重约束，研究配送人员安排。项目包含离线调度、在线策略及对比可视化，并整理成可逐页浏览的 HTML 汇报。

三个事实模块：
1. 路网与最短路：无向正权图，Dijkstra 求节点间最短路径。
2. 可行批次与调度：计算载重、送达次序、最晚出发时间、返回时间，并检查给定配送员数量是否可行。
3. 在线与离线比较：在线策略基于当前可见待送订单，记录等待/派送决策；报告分离线、在线、对比三个入口。

实现边界：有名为 find_minimum_courier_count 的二分查找接口，内部含候选池、启发式优先级、短前瞻与回退策略；不能据此宣传为已证明的全局最优求解器。

可以做一个小型独立示意：以“演示样例 · 合成路网”为清晰标签，画 5–6 个虚构地点和明确正权边；点击起终点，实时运行 Dijkstra 并高亮路线、累加路程。它展示已验证的最短路模块，不应声称复现原始校园地图、真实订单、配送员最优数或论文实验结果。若要做派单示意，必须另行说明简化假设；最短路互动最稳妥。

来源：
- https://github.com/1205240810/campus-delivery-algorithm-presentation/blob/main/README.md
- https://github.com/1205240810/campus-delivery-algorithm-presentation/blob/main/src/campus_delivery/graph.py
- https://github.com/1205240810/campus-delivery-algorithm-presentation/blob/main/src/campus_delivery/offline.py
- https://github.com/1205240810/campus-delivery-algorithm-presentation/blob/main/src/campus_delivery/online.py
- https://github.com/1205240810/campus-delivery-algorithm-presentation/blob/main/index.html

**真实在线汇报已验证 HTTP 200，可补入 projects.json demoUrl：**
- https://1205240810.github.io/campus-delivery-algorithm-presentation/ （title：校园外卖最小配送人员问题 · 详细汇报版）
- https://1205240810.github.io/campus-delivery-algorithm-presentation/frontends/offline/index.html （HTTP 200）
- https://1205240810.github.io/campus-delivery-algorithm-presentation/frontends/online/index.html （HTTP 200）
- https://1205240810.github.io/campus-delivery-algorithm-presentation/frontends/compare/index.html （HTTP 200）

## ospf-bridge-simulation

建议中文短名：**OSPF 网络仿真**。类型：网络实验 / 基础设施。

两句概述：使用 Python、QEMU 与 Open vSwitch，在 Ubuntu 虚拟机中搭建虚拟路由器网络。Streamlit 控制台提供拓扑查看、网络启动、自动配置和设备 Ping 探测入口，并支持与 Windows 宿主机连通的实验配置。

三个事实模块：
1. YAML 拓扑：定义设备、网段与链路，在 Web 控制台绘制拓扑。
2. 网络生命周期：控制台调用底层启动、自动 IP/OSPF 配置及清理脚本。
3. 连通性探测：选择源节点和目标 IP，经设备控制台发起 Ping，并显示回显。

边界：这些是 README 声明和源码中的实现入口，本次没有实际启动 Ubuntu、QEMU 或网络，因此不要声称本次测试验证了全网连通。它也不是 ospf-v2-demo 的浏览器本地模拟演示，勿混同两仓库。

来源：
- https://github.com/1205240810/ospf-bridge-simulation/blob/main/README.md
- https://github.com/1205240810/ospf-bridge-simulation/blob/main/web_ui.py

在线演示：README 提供本地 Streamlit 启动方式；同名 GitHub Pages 返回 404，未找到公开在线演示。

## xiaohongshu-ai-workflow

建议中文短名：**小红书创作工作流**。类型：AI 工作流 / 内容工具。

两句概述：把账号方向、选题矩阵、草稿生成、人工审核和网页发布串成一套本地流程。项目用结构化 JSON 保存草稿，并通过 Playwright 接入 Edge，完成创作中心的内容填写与发布操作。

三个事实模块：
1. 规划选题：从账号策略生成选题矩阵，并支持按方向批量创建草稿。
2. 生成与审核：本地模板生成标题、正文和话题初稿，人工预览、批准或驳回。
3. 发布执行：以 Edge 本地测试配置或真实 Edge CDP 会话填充内容，显式指定发布参数后才点击发布。

边界：初稿生成器是本地模板生成器，不应宣传为已经接入在线大模型 API。默认 dry-run；草稿正式发布默认检查 approved，但脚本存在显式覆盖参数，因此不应宣传审核绝对不可绕过。工作台仅展示流程，不自动打开用户账号、不执行真实发布。

来源：
- https://github.com/1205240810/xiaohongshu-ai-workflow/blob/main/README.md
- https://github.com/1205240810/xiaohongshu-ai-workflow/blob/main/scripts/publish.py

在线演示：README 说明本地命令与用户浏览器流程；同名 GitHub Pages 返回 404，未找到公开在线演示。

## 工作台落地

- 六项目按网络工程、数据与算法、效率工具分类；原数据 ID 与外链不变。
- 网络实验和相册保留已有交互；资产成本提供独立计算示例；配送提供合成路网的 Dijkstra 示意；网络仿真和内容流程以源码导览展示。
- 手机保持文章在前，作品试用按需展开；项目选择、关卡和游戏按钮适配触控。
- 侧栏灯阵提供三关、撤回、重置和精确解提示，不阻挡任何文章或项目。
- 数学逻辑与内容 ID 检查纳入 npm run check。

## 交互验收

- 桌面 1280 × 960：三类筛选分别显示对应两项目；六项目逐个可选；源码导览步骤可切换。
- 成本示例从 3600 改为 1800，180 天结果从 20.00 变为 10.00 元/天。
- 配送改选运动场，路线餐厅 → 教学楼 → 西宿舍 → 运动场，共 490 米；完整汇报链接准确。
- 相册筛选黑夜，命中 2/6，色彩均值 45%、纹理均值 32%。
- 灯阵提示定位第 2 行第 2 列；撤回恢复 00 步；第一关两步通关，焦点移至下一关；下一关焦点回到灯阵。
- 手机 390 × 844、375 × 812 与横屏 844 × 390：无页面横向溢出；手机默认折叠试用，输入框字号 16px、高度 44px，灯格触控宽度至少 47px。
- 项目切换动画遵循 prefers-reduced-motion。

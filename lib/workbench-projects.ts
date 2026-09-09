export const PROJECT_CATEGORIES = [
  '全部',
  '网络工程',
  '数据与算法',
  '效率工具',
] as const;
export type ProjectCategory = (typeof PROJECT_CATEGORIES)[number];
export type PreviewKind =
  | 'network'
  | 'album'
  | 'delivery'
  | 'cost'
  | 'bridge'
  | 'workflow';

export const WORKBENCH_PROJECTS = [
  {
    id: 'ospf-v2-demo',
    title: 'OSPF 网络实验',
    category: '网络工程',
    kind: 'network',
    prompt: '改一组地址，看四台设备如何生成配置。',
    mode: '交互预览',
  },
  {
    id: 'intelligent-album-demo',
    title: '智能相册分析',
    category: '数据与算法',
    kind: 'album',
    prompt: '沿着时间、季节与色彩，找到照片里的线索。',
    mode: '交互预览',
  },
  {
    id: 'campus-delivery-algorithm-presentation',
    title: '校园配送调度',
    category: '数据与算法',
    kind: 'delivery',
    prompt: '从一张路网出发，理解配送路径与调度。',
    mode: '算法示意',
  },
  {
    id: 'personal-asset-cost-tracker',
    title: '资产日均成本',
    category: '效率工具',
    kind: 'cost',
    prompt: '把一次投入，摊进真实使用的每一天。',
    mode: '计算示例',
  },
  {
    id: 'ospf-bridge-simulation',
    title: 'OSPF 网络仿真',
    category: '网络工程',
    kind: 'bridge',
    prompt: '把拓扑变成可以配置、可以探测的虚拟网络。',
    mode: '项目导览',
  },
  {
    id: 'xiaohongshu-ai-workflow',
    title: '内容创作工作流',
    category: '效率工具',
    kind: 'workflow',
    prompt: '从选题到审核，让创作流程有迹可循。',
    mode: '项目导览',
  },
] as const;

export const PROJECT_GUIDES = {
  bridge: [
    {
      title: '定义拓扑',
      label: 'YAML → 网络结构',
      detail:
        '用 YAML 描述设备、网段与链路，在 Streamlit 控制台查看节点之间的连接。',
      file: 'README.md',
    },
    {
      title: '启动与配置',
      label: 'QEMU + Open vSwitch',
      detail:
        '在 Ubuntu 虚拟机中启动路由器网络，通过控制台调用底层脚本，完成 IP 与 OSPF 配置。',
      file: 'web_ui.py',
    },
    {
      title: '连通性探测',
      label: '源设备 → 目标 IP',
      detail:
        '选择源节点和目标地址，经设备控制台发起 Ping，并在界面查看回显。实验环境还可连接 Windows 宿主机。',
      file: 'web_ui.py',
    },
  ],
  workflow: [
    {
      title: '组织选题',
      label: '账号方向 → 选题矩阵',
      detail: '从账号策略生成选题矩阵，按内容方向整理素材，并批量创建草稿。',
      file: 'README.md',
    },
    {
      title: '草稿与审核',
      label: '本地模板 → 人工判断',
      detail:
        '生成标题、正文和话题的模板初稿，以结构化 JSON 保存，再由人预览、修改、批准或驳回。',
      file: 'README.md',
    },
    {
      title: '网页执行',
      label: 'Playwright + Edge',
      detail:
        '通过 Edge 会话填写创作中心。默认以 dry-run 检查流程，显式指定发布参数后才执行发布操作。',
      file: 'scripts/publish.py',
    },
  ],
} as const;

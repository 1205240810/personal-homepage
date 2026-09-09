'use client';
import { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  ChevronDown,
  Network,
  Images,
  Route,
  Wallet,
  Workflow,
  Server,
  ArrowRight,
  ChevronRight,
  Code2,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/ui/collapsible';
import {
  PROJECT_CATEGORIES,
  PROJECT_GUIDES,
  PROJECT_PRESENTATION,
  WORKBENCH_PROJECTS,
  type ProjectCategory,
  type PreviewKind,
} from '@/lib/workbench-projects';
import {
  assetDailyCost,
  DELIVERY_NODES,
  DELIVERY_EDGES,
  deliveryRoute,
} from '@/lib/workbench-demos';
import projects from '@/content/data/projects.json';
import photos from '@/content/data/album-preview.json';
import { AlbumPreview, NetworkPreview } from './project-workbench';
import './project-library.css';

const ICONS = {
  network: Network,
  album: Images,
  delivery: Route,
  cost: Wallet,
  bridge: Server,
  workflow: Workflow,
};

function CostPreview() {
  const [amount, setAmount] = useState('3600');
  const [start, setStart] = useState('2026-01-01');
  const [end, setEnd] = useState('2026-06-29');
  const result = assetDailyCost(Number(amount), start, end);
  return (
    <div className="cost-preview">
      <div className="demo-screen-label">
        <span>一台设备，每一天</span>
        <span>独立计算示例</span>
      </div>
      <div className="cost-result" role="status">
        <span>日均持有成本</span>
        <strong>
          {result ? `¥ ${result.daily.toFixed(2)}` : '—'}
          <small> / 天</small>
        </strong>
        <p>
          {result
            ? `¥ ${Number(amount).toLocaleString('zh-CN')} ÷ ${result.days} 天`
            : '请填写有效金额，结算日应不早于购入日。'}
        </p>
      </div>
      <div className="cost-fields">
        <label>
          购入金额 / 元
          <input
            type="number"
            min="0.01"
            step="0.01"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label>
          购入日期
          <input
            type="date"
            value={start}
            max={end || undefined}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        <label>
          结算日期
          <input
            type="date"
            value={end}
            min={start || undefined}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>
      </div>
      <p className="demo-disclosure">
        示例数据，仅在本页计算。沿用项目的日均成本公式，持有天数包含购入与结算当天。完整应用还支持分类账本、归档和恢复追踪。
      </p>
    </div>
  );
}

function DeliveryPreview() {
  const [destination, setDestination] = useState(3);
  const route = deliveryRoute(destination)!;
  const usedEdge = (a: number, b: number) =>
    route.path.some(
      (n, i) =>
        i > 0 &&
        ((route.path[i - 1] === a && n === b) ||
          (route.path[i - 1] === b && n === a)),
    );
  return (
    <div className="delivery-preview">
      <div className="demo-screen-label">
        <span>Dijkstra · 从餐厅出发</span>
        <span>合成路网示意</span>
      </div>
      <div className="delivery-map" aria-hidden="true">
        <svg viewBox="0 0 490 215">
          {DELIVERY_EDGES.map(([a, b, weight]) => (
            <g key={`${a}-${b}`} className={usedEdge(a, b) ? 'route-used' : ''}>
              <line
                x1={DELIVERY_NODES[a].x}
                y1={DELIVERY_NODES[a].y}
                x2={DELIVERY_NODES[b].x}
                y2={DELIVERY_NODES[b].y}
              />
              <text
                x={(DELIVERY_NODES[a].x + DELIVERY_NODES[b].x) / 2}
                y={(DELIVERY_NODES[a].y + DELIVERY_NODES[b].y) / 2 - 8}
              >
                {weight}
              </text>
            </g>
          ))}
          {DELIVERY_NODES.map((node, i) => (
            <g
              key={node.name}
              className={`route-place ${route.path.includes(i) ? 'route-used' : ''}`}
            >
              <circle cx={node.x} cy={node.y} r="18" />
              <text x={node.x} y={node.y + 4}>
                {i === 0 ? '起' : String(i)}
              </text>
              <text className="route-name" x={node.x} y={node.y + 37}>
                {node.name}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <label className="delivery-destination">
        送到哪里
        <select
          value={destination}
          onChange={(e) => setDestination(Number(e.target.value))}
        >
          {DELIVERY_NODES.slice(1).map((node, i) => (
            <option key={node.name} value={i + 1}>
              {i + 1} · {node.name}
            </option>
          ))}
        </select>
      </label>
      <div className="delivery-result" role="status">
        <p>{route.path.map((i) => DELIVERY_NODES[i].name).join(' → ')}</p>
        <strong>
          {route.distance}
          <small> 米</small>
        </strong>
      </div>
      <p className="demo-disclosure">
        切换终点，实时计算最短路。此处使用虚构节点与距离；完整课题进一步研究载重、时间窗及在线
        / 离线调度，原始汇报可直接打开。
      </p>
    </div>
  );
}

function GuidePreview({
  kind,
  url,
}: {
  kind: 'bridge' | 'workflow';
  url: string;
}) {
  const [step, setStep] = useState(0);
  const steps = PROJECT_GUIDES[kind];
  return (
    <div className="guide-preview">
      <div className="demo-screen-label">
        <span>
          {kind === 'bridge' ? '让网络真正运行起来' : '人在回路中的创作流程'}
        </span>
        <span>源码导览</span>
      </div>
      <Tabs
        value={String(step)}
        onValueChange={(v) => setStep(Number(v))}
        className="guide-tabs"
      >
        <TabsList aria-label="选择项目流程步骤" className="guide-step-list">
          {steps.map((item, i) => (
            <TabsTrigger value={String(i)} key={item.title}>
              <span>0{i + 1}</span>
              {item.title}
              {i < 2 && <ArrowRight size={14} aria-hidden="true" />}
            </TabsTrigger>
          ))}
        </TabsList>
        {steps.map((item, i) => (
          <TabsContent
            key={item.title}
            value={String(i)}
            className="guide-detail"
          >
            <span className="guide-step-number" aria-hidden="true">
              0{i + 1}
            </span>
            <div>
              <span className="b-mono">{item.label}</span>
              <h3>{item.title}</h3>
              <p>{item.detail}</p>
              <a
                href={`${url}/blob/main/${item.file}`}
                target="_blank"
                rel="noreferrer"
              >
                查看对应源码 <ArrowUpRight size={14} />
              </a>
            </div>
          </TabsContent>
        ))}
      </Tabs>
      <p className="demo-disclosure">
        {kind === 'bridge'
          ? '这里展示项目的真实结构与运行入口。网络引擎需要本地实验环境，本页不启动虚拟设备。'
          : '这里展示选题、审核和网页执行的衔接。草稿使用本地模板，本页不连接账号或执行发布。'}
      </p>
    </div>
  );
}

function Preview({ kind, url }: { kind: PreviewKind; url: string }) {
  if (kind === 'network') return <NetworkPreview />;
  if (kind === 'album') return <AlbumPreview />;
  if (kind === 'cost') return <CostPreview />;
  if (kind === 'delivery') return <DeliveryPreview />;
  return <GuidePreview kind={kind} url={url} />;
}

export function ProjectWorkbench() {
  const [category, setCategory] = useState<ProjectCategory>('全部');
  const [selectedId, setSelectedId] = useState<string>(
    WORKBENCH_PROJECTS[0].id,
  );
  const [expanded, setExpanded] = useState(false);
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const query = matchMedia('(min-width: 761px)');
    const sync = () => setDesktop(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);
  const visible = WORKBENCH_PROJECTS.filter(
    (p) => category === '全部' || p.category === category,
  );
  const selected = visible.find((p) => p.id === selectedId) || visible[0];
  const source = projects.find((p) => p.id === selected.id)!;
  const Icon = ICONS[selected.kind];
  const presentation = PROJECT_PRESENTATION[selected.kind];
  return (
    <section
      className="project-library"
      aria-labelledby="project-library-title"
    >
      <header className="b-section-head">
        <h2 id="project-library-title">
          <span className="b-section-number b-mono">01</span>作品，打开来看看
        </h2>
        <a className="b-text-link" href="/projects">
          全部作品 <ArrowUpRight size={14} />
        </a>
      </header>
      <ToggleGroup
        aria-label="按项目类型筛选"
        className="library-filters"
        value={[category]}
        onValueChange={(values) => {
          const next = values[0] as ProjectCategory | undefined;
          if (next) setCategory(next);
        }}
      >
        {PROJECT_CATEGORIES.map((item) => (
          <ToggleGroupItem value={item} key={item}>
            {item}
            <span>
              {item === '全部'
                ? WORKBENCH_PROJECTS.length
                : WORKBENCH_PROJECTS.filter((p) => p.category === item).length}
            </span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <Tabs
        value={selected.id}
        onValueChange={(value) => setSelectedId(String(value))}
        className="library-projects"
      >
        <TabsList
          aria-label="选择工作台项目"
          className={`library-project-list ${category !== '全部' ? 'is-filtered' : ''}`}
        >
          {visible.map((p) => {
            const ItemIcon = ICONS[p.kind];
            return (
              <TabsTrigger value={p.id} key={p.id} data-project-kind={p.kind}>
                <span className="library-item-mark" aria-hidden="true">
                  {p.kind === 'album' ? (
                    <img
                      src={photos[0].url}
                      alt=""
                      width={44}
                      height={44}
                      loading="lazy"
                    />
                  ) : (
                    <ItemIcon size={23} strokeWidth={1.5} />
                  )}
                </span>
                <span className="library-item-copy">
                  <strong>{p.title}</strong>
                  <small>{PROJECT_PRESENTATION[p.kind].subtitle}</small>
                </span>
                <ChevronRight
                  className="library-item-arrow"
                  size={16}
                  aria-hidden="true"
                />
              </TabsTrigger>
            );
          })}
        </TabsList>
        {visible.map((p) => (
          <TabsContent
            value={p.id}
            key={p.id}
            className="library-project-panel"
          >
            <article className="b-instrument" data-project-kind={selected.kind}>
              <header className="b-hardware-head">
                <div>
                  <span className="b-hardware-tag b-mono">
                    {selected.category}
                    <span />
                    {presentation.stack}
                  </span>
                  <h3>{selected.title}</h3>
                </div>
                <span className="library-project-emblem" aria-hidden="true">
                  <Icon size={30} strokeWidth={1.2} />
                </span>
              </header>
              <p className="library-project-prompt">{selected.prompt}</p>
              <div className="library-feature-line" aria-label="项目要点">
                {presentation.features.map((feature) => (
                  <span key={feature}>{feature}</span>
                ))}
              </div>
              <Collapsible
                open={desktop || expanded}
                onOpenChange={setExpanded}
                className="project-disclosure"
              >
                <CollapsibleTrigger className="demo-expand-button">
                  {expanded ? '收起项目内容' : `展开${selected.mode}`}
                  <ChevronDown size={17} />
                </CollapsibleTrigger>
                <CollapsibleContent keepMounted>
                  <div className="b-screen-bezel">
                    <div className="b-screen" key={selected.id}>
                      <Preview kind={selected.kind} url={source.url} />
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
              <div className="library-project-footer">
                <span className="library-preview-kind">{selected.mode}</span>
                <div>
                  {source.demoUrl && (
                    <a
                      className="library-main-link"
                      href={source.demoUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {selected.kind === 'delivery'
                        ? '打开完整汇报'
                        : '打开完整演示'}{' '}
                      <ArrowUpRight size={15} />
                    </a>
                  )}
                  <a href={source.url} target="_blank" rel="noreferrer">
                    <Code2 size={16} />
                    源码 <ArrowUpRight size={15} />
                  </a>
                </div>
              </div>
            </article>
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}

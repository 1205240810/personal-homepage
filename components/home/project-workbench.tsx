'use client';
import { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  Network,
  Images,
  Check,
  RotateCcw,
  ChevronDown,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/ui/collapsible';
import { addressPlan } from '@/lib/project-preview';
import photos from '@/content/data/album-preview.json';
import projects from '@/content/data/projects.json';
import './project-workbench.css';

function NetworkPreview() {
  const [lan, setLan] = useState('1'),
    [host, setHost] = useState('20');
  const [plan, setPlan] = useState(addressPlan(1, 20)!),
    [selected, setSelected] = useState(1),
    [stage, setStage] = useState(0);
  const valid = addressPlan(Number(lan), Number(host));
  const dirty = valid?.[0].ip !== plan[0].ip;
  const device = plan[selected];
  return (
    <div className="demo-network">
      <div className="demo-screen-label">
        <span>OSPF v2 · 四节点实验</span>
        <span>本地交互预览</span>
      </div>
      <div className="demo-topology" aria-label="PC1 经 FRR1 和 FRR2 连接 PC2">
        {plan.map((node, i) => (
          <button
            key={node.id}
            className="demo-node"
            aria-label={`查看 ${node.id} 配置`}
            aria-pressed={selected === i}
            onClick={() => setSelected(i)}
          >
            <span
              className={`demo-node-icon ${i === 0 || i === 3 ? 'is-pc' : ''}`}
              aria-hidden="true"
            >
              {i === 0 || i === 3 ? <span /> : <Network size={21} />}
            </span>
            <strong>{node.id}</strong>
            <small>{node.ip}</small>
          </button>
        ))}
        <span className="demo-subnet">FRR 互联 · 10.255.1.0/30 · AREA 0</span>
      </div>
      <form
        className="demo-planner"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) {
            setPlan(valid);
            setStage(0);
          }
        }}
      >
        <label>
          LAN 起始网段
          <span className="demo-ip-field">
            10.10.
            <input
              aria-label="LAN 网段第三段"
              type="number"
              min="1"
              max="250"
              required
              value={lan}
              onChange={(e) => {
                setLan(e.target.value);
                setStage(0);
              }}
            />
            .0/24
          </span>
        </label>
        <label>
          PC 主机号
          <input
            aria-label="PC 主机号"
            type="number"
            min="2"
            max="254"
            required
            value={host}
            onChange={(e) => {
              setHost(e.target.value);
              setStage(0);
            }}
          />
        </label>
        <button className="demo-plan-button" type="submit" disabled={!valid}>
          生成配置
        </button>
      </form>
      <div className="demo-config">
        <div>
          <span>{device.id} 配置</span>
          <span>{dirty ? '输入已修改，请重新生成' : '点击上方节点切换'}</span>
        </div>
        <pre aria-label={`${device.id} 生成配置`}>{device.config}</pre>
      </div>
      <div className="demo-acceptance">
        <button
          className="demo-primary"
          disabled={!valid || dirty}
          onClick={() => setStage(stage === 0 ? 1 : stage === 1 ? 2 : 0)}
        >
          {stage === 0
            ? '模拟应用与下发'
            : stage === 1
              ? '执行模拟 Ping'
              : '重新验收'}
          {stage === 2 ? <RotateCcw size={14} /> : <ArrowUpRight size={14} />}
        </button>
        <span role="status">
          {stage === 0
            ? '规划完成，等待应用'
            : stage === 1
              ? '配置已模拟下发，可继续 Ping'
              : `目标 ${plan[3].ip.split('/')[0]} 已在地址计划中 ✓`}
        </span>
      </div>
      <p className="demo-disclosure">
        地址规划在本地计算；应用、下发和 Ping 使用模拟回执。
      </p>
    </div>
  );
}

function AlbumPreview() {
  const [time, setTime] = useState('全部'),
    [season, setSeason] = useState('全部'),
    [type, setType] = useState('全部'),
    [selected, setSelected] = useState<number | null>(null);
  const visible = photos.filter(
    (p) =>
      (time === '全部' || p.time === time) &&
      (season === '全部' || p.season === season) &&
      (type === '全部' || p.type === type),
  );
  const avg = (key: 'color_score' | 'texture_complexity') =>
    visible.length
      ? `${Math.round((visible.reduce((sum, p) => sum + p.features[key], 0) / visible.length) * 100)}%`
      : '暂无';
  const current = visible.find((p) => p.id === selected);
  return (
    <div className="demo-album">
      <div className="demo-screen-label">
        <span>智能相册 · 规则分析</span>
        <span>公开展示集 6 / 76 张</span>
      </div>
      <div className="demo-filters">
        {[
          {
            label: '时段',
            value: time,
            set: setTime,
            options: ['全部', '白天', '黑夜'],
          },
          {
            label: '季节',
            value: season,
            set: setSeason,
            options: ['全部', '春', '秋', '冬'],
          },
          {
            label: '已有标签',
            value: type,
            set: setType,
            options: ['全部', '森林绿植', '海景', '现代化大都市', '乡村田园'],
          },
        ].map((f) => (
          <label key={f.label}>
            {f.label}
            <select
              aria-label={`相册${f.label}`}
              value={f.value}
              onChange={(e) => {
                f.set(e.target.value);
                setSelected(null);
              }}
            >
              {f.options.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <div className="demo-photo-grid">
        {visible.length ? (
          visible.map((p) => (
            <button
              key={p.id}
              className="demo-photo"
              aria-label={`查看照片 ${p.id} 的规则标签`}
              aria-pressed={selected === p.id}
              onClick={() => setSelected(selected === p.id ? null : p.id)}
            >
              <img
                src={p.url}
                alt={`${p.season}季${p.time}的${p.type}照片`}
                loading="lazy"
              />
              <span>
                {p.type}
                <small>
                  {p.season} · {p.time}
                </small>
              </span>
              {selected === p.id && (
                <Check className="demo-photo-check" size={17} />
              )}
            </button>
          ))
        ) : (
          <div className="demo-empty">
            <Images size={28} />
            <p>这组条件下没有照片。</p>
            <button
              onClick={() => {
                setTime('全部');
                setSeason('全部');
                setType('全部');
              }}
            >
              清除筛选
            </button>
          </div>
        )}
      </div>
      <div className="demo-photo-stats" role="status">
        <span>
          命中 <strong>{visible.length}</strong> / 6
        </span>
        <span>
          色彩均值 <strong>{avg('color_score')}</strong>
        </span>
        <span>
          纹理均值 <strong>{avg('texture_complexity')}</strong>
        </span>
      </div>
      {current ? (
        <div className="demo-photo-evidence">
          <strong>PHOTO {String(current.id).padStart(3, '0')}</strong>
          <span>
            {current.type} · {current.season} · {current.time}
          </span>
          <span>
            原始规则分值：色彩 {current.features.color_score} / 纹理{' '}
            {current.features.texture_complexity}
          </span>
          <button onClick={() => setSelected(null)}>收起</button>
        </div>
      ) : (
        <p className="demo-photo-hint">
          组合筛选，观察结果变化；点开照片查看分析依据。
        </p>
      )}
      <p className="demo-disclosure">
        真实照片与已有规则标签来自项目公开数据，分值不代表人工审美评价。
      </p>
    </div>
  );
}

export function ProjectWorkbench() {
  const [project, setProject] = useState('network');
  const [expanded, setExpanded] = useState(false);
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const query = matchMedia('(min-width: 761px)');
    const sync = () => setDesktop(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);
  const selected = projects.find(
    (p) =>
      p.id ===
      (project === 'network' ? 'ospf-v2-demo' : 'intelligent-album-demo'),
  )!;
  return (
    <>
      <article className="b-instrument" aria-label="可以试用的两个项目">
        <header className="b-hardware-head">
          <div>
            <span className="b-hardware-tag b-mono">INTERACTIVE WORK</span>
            <h2>
              {project === 'network'
                ? 'OSPF v2 网络实验'
                : '智能相册 · 线索与照片'}
            </h2>
          </div>
          <span className="b-screw" aria-hidden="true" />
        </header>
        <Tabs
          value={project}
          onValueChange={(v) => setProject(String(v))}
          className="demo-projects"
        >
          <TabsList aria-label="选择项目示例" className="demo-tabs">
            <TabsTrigger value="network">
              <Network size={16} />
              网络实验
            </TabsTrigger>
            <TabsTrigger value="album">
              <Images size={16} />
              相册分析
            </TabsTrigger>
          </TabsList>
          <Collapsible
            open={desktop || expanded}
            onOpenChange={setExpanded}
            className="project-disclosure"
          >
            {!desktop && !expanded && (
              <div className="demo-compact-preview">
                {project === 'network' ? (
                  <div
                    className="demo-compact-network"
                    aria-label="PC1、FRR1、FRR2、PC2 四节点网络"
                  >
                    {['PC1', 'FRR1', 'FRR2', 'PC2'].map((id) => (
                      <span key={id}>{id}</span>
                    ))}
                  </div>
                ) : (
                  <div className="demo-compact-photos">
                    {photos.slice(0, 3).map((p) => (
                      <img key={p.id} src={p.url} alt={p.type} loading="lazy" />
                    ))}
                  </div>
                )}
                <p>
                  {project === 'network'
                    ? '从地址规划到设备配置，试一遍四节点网络实验。'
                    : '用时间、季节和已有标签，筛选照片里的线索。'}
                </p>
              </div>
            )}
            <CollapsibleTrigger className="demo-expand-button">
              {expanded ? '收起试用' : '展开试用'}
              <ChevronDown size={17} />
            </CollapsibleTrigger>
            <CollapsibleContent keepMounted>
              <div className="b-screen-bezel">
                <div className="b-screen">
                  <TabsContent value="network" keepMounted>
                    <NetworkPreview />
                  </TabsContent>
                  <TabsContent value="album" keepMounted>
                    <AlbumPreview />
                  </TabsContent>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </Tabs>
        <div className="b-bottom-rail" aria-hidden="true">
          <div className="b-vents">
            {Array.from({ length: 12 }, (_, i) => (
              <i key={i} />
            ))}
          </div>
          <span className="b-mono">TWO WORKS. TRY THEM HERE.</span>
          <span className="b-screw" />
        </div>
      </article>
      <div
        className={`b-project-note ${!desktop && !expanded ? 'is-compact-note' : ''}`}
      >
        <p>
          {project === 'network'
            ? '改一组地址，看看四台设备的配置如何生成。'
            : '换一组筛选条件，从真实照片里找到规律。'}
          <br />
          {project === 'network'
            ? '从网络拓扑，一步步走到验收。'
            : '时间、季节和已有标签，共同缩小范围。'}
        </p>
        <a
          className="b-text-link"
          href={selected.demoUrl!}
          target="_blank"
          rel="noreferrer"
        >
          打开完整演示
          <ArrowUpRight size={16} />
        </a>
      </div>
    </>
  );
}

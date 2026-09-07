import { ArrowLeft, ArrowUpRight, Footprints } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DISTRICTS, getScene } from '@/lib/world/registry';
import type { ArticleSummary } from '@/lib/content/source';
import type { WorldAction, WorldSnapshot } from '@/lib/world/types';
import projects from '@/content/data/projects.json';
export function WorldAtlas({
  posts,
  snapshot,
  onClose,
  onAction,
  onWalk,
}: {
  posts: ArticleSummary[];
  snapshot: WorldSnapshot | null;
  onClose: () => void;
  onAction: (action: WorldAction) => void;
  onWalk: (node: string) => void;
}) {
  const bridge = snapshot?.exploration.bridge,
    lift = snapshot?.exploration.lift;
  const inEast =
    snapshot?.sceneId === 'life' || snapshot?.sceneId === 'graduate';
  return (
    <section className="river-atlas" aria-label="河谷地图">
      <header className="river-atlas-header">
        <div>
          <span className="eyebrow">THE RIVER JOURNAL</span>
          <h2>沿途，都是去处。</h2>
          <p>
            {snapshot ? getScene(snapshot.sceneId).title : '河湾入口'} · 已找到{' '}
            {snapshot?.discoveries.length ?? 0} / 2 处小秘密
          </p>
        </div>
        <Button variant="ghost" onClick={onClose}>
          <ArrowLeft size={16} />
          回到原处
        </Button>
      </header>
      <svg
        className="river-route-map"
        viewBox="0 0 1080 320"
        role="img"
        aria-label={`河湾书屋经浮桥连接水车工坊。浮桥${bridge ? '已接通' : '待调整'}，升降捷径${lift ? '已启动' : '待修复'}。`}
      >
        <path
          d="M70 65Q145 8 385 42L435 84 472 194 415 279Q185 328 63 249Z"
          fill="#d6dfbf"
          stroke="#aab898"
          strokeWidth="2"
        />
        <path
          d="M596 86Q672 6 907 46L1032 133 987 269 809 291 654 246 600 213Z"
          fill="#d6dfbf"
          stroke="#aab898"
          strokeWidth="2"
        />
        <path
          d="M523 0C451 112 590 174 516 320"
          fill="none"
          stroke="#78a7a0"
          strokeWidth="35"
          opacity=".42"
        />
        <path
          d="M165 225L261 135 381 190 468 186 601 186 744 160 851 111 937 223"
          fill="none"
          stroke="#a89970"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M468 186H601"
          stroke={bridge ? '#a17e49' : '#abb3a0'}
          strokeWidth="12"
          strokeDasharray={bridge ? undefined : '5 6'}
        />
        <path
          d="M744 186Q728 310 397 295T165 225"
          stroke={lift ? '#ba9852' : '#a8b59a'}
          strokeWidth="2"
          strokeDasharray="7 7"
          fill="none"
        />
        {[
          [165, 225, '入口'],
          [261, 135, '书屋'],
          [381, 190, '水闸'],
          [851, 111, '工坊'],
          [937, 223, '眺望台'],
        ].map(([x, y, label]) => (
          <g key={label}>
            <circle
              cx={x}
              cy={y}
              r="9"
              fill="#eef0da"
              stroke="#788b6c"
              strokeWidth="3"
            />
            <text x={x} y={Number(y) - 23} textAnchor="middle">
              {label}
            </text>
          </g>
        ))}
        <text x="535" y="159" textAnchor="middle">
          {bridge ? '浮桥已接通' : '调整水位'}
        </text>
        <text x="570" y="316" textAnchor="middle">
          {lift ? '升降捷径已启动' : '工坊回路 → 返回捷径'}
        </text>
        <circle
          cx={inEast ? 794 : 211}
          cy={inEast ? 190 : 185}
          r="7"
          fill="#b48843"
          stroke="#fff5d0"
          strokeWidth="4"
        />
        <text
          x={inEast ? 794 : 211}
          y={inEast ? 218 : 211}
          textAnchor="middle"
          style={{ fontSize: 12 }}
        >
          你在这一侧
        </text>
      </svg>
      <div className="river-atlas-links">
        {DISTRICTS.map((d, i) => (
          <section key={d.id}>
            <small>0{i + 1}</small>
            <h3>{d.title}</h3>
            <p>
              {d.id === 'blog'
                ? `${posts.length} 篇文章 · ${posts[0]?.date ?? ''}`
                : d.id === 'projects'
                  ? `${projects.length} 个公开项目`
                  : d.subtitle}
            </p>
            <button onClick={() => onWalk(d.nodeId)}>
              <Footprints size={14} />
              沿路前往
            </button>
            <button onClick={() => onAction(d.action)}>
              {d.id === 'play' ? '翻开卡片' : '直接查看'}
              <ArrowUpRight size={14} />
            </button>
          </section>
        ))}
      </div>
      <p className="river-atlas-note">
        探索进度保存在本机。文章与项目随时可以打开。
      </p>
    </section>
  );
}

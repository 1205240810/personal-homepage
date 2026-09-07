import { ArrowLeft, ArrowUpRight, Footprints } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DISTRICTS } from '@/lib/world/registry';
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
  return (
    <section className="blueprint-layer atlas-v2" aria-label="小院地图">
      <div className="blueprint-grid" />
      <div className="atlas-image" />
      <header className="atlas-intro">
        <span className="eyebrow">小院里的去处</span>
        <h2>想去哪里坐一会？</h2>
        <p>可以走过去，也可以直接打开内容。</p>
        <Button variant="ghost" onClick={onClose}>
          <ArrowLeft size={14} />
          回到原处
        </Button>
      </header>
      <div className="district-layout">
        {DISTRICTS.map((district, index) => (
          <section
            key={district.id}
            className={`district-card district-${district.id}`}
            aria-label={district.title}
          >
            <small>
              0{index + 1} / {district.subtitle}
            </small>
            <h3>{district.title}</h3>
            <p>
              {district.id === 'blog'
                ? `${posts.length} 篇记录 · ${posts[0]?.date ?? ''}`
                : district.id === 'projects'
                  ? `${projects.length} 个公开项目`
                  : district.id === 'profile'
                    ? '一份完整的个人档案'
                    : `踢球、记忆与电路 · 已找到 ${snapshot?.discoveries.length ?? 0} / 2 处彩蛋`}
            </p>
            <div className="district-actions">
              <Button
                size="sm"
                variant="outline"
                onClick={() => onWalk(district.nodeId)}
              >
                <Footprints size={14} />
                沿路前往
              </Button>
              <button onClick={() => onAction(district.action)}>
                {district.id === 'play' ? '开始小游戏' : '直接查看'}
                <ArrowUpRight size={13} />
              </button>
            </div>
          </section>
        ))}
      </div>
      <p className="atlas-footnote">
        小路连接书屋、工作室、住处与花园 · WASD 移动 · Shift 快走 ·
        点击物件沿路前往
      </p>
    </section>
  );
}

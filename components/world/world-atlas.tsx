import { ArrowLeft, ArrowUpRight, DoorOpen } from 'lucide-react';
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
}: {
  posts: ArticleSummary[];
  snapshot: WorldSnapshot | null;
  onClose: () => void;
  onAction: (action: WorldAction) => void;
}) {
  return (
    <section className="mecha-atlas" aria-label="机甲拆解图">
      <header className="mecha-atlas-header">
        <div>
          <span className="eyebrow">THE SAME WORLD, THREE DOORS</span>
          <h2>打开机甲，也打开一些故事。</h2>
          <p>
            当前位置：{snapshot ? getScene(snapshot.sceneId).title : '维修通道'}
          </p>
        </div>
        <Button variant="ghost" onClick={onClose}>
          <ArrowLeft size={16} />
          回到原处
        </Button>
      </header>
      <div className="mecha-atlas-image">
        <img
          src="/art/mecha-section.png"
          alt="完整侧视机甲：左侧驾驶舱、中部胸腔档案库、右侧检修工坊，通过同一条维修通道连接。"
        />
        {DISTRICTS.map((d, i) => (
          <button
            key={d.id}
            style={{ left: `${d.position.x}%` }}
            onClick={() =>
              onAction({ type: 'enter-scene', sceneId: d.sceneId })
            }
            aria-label={`进入${d.title}`}
            data-current={snapshot?.sceneId === d.sceneId}
          >
            0{i + 1}
          </button>
        ))}
      </div>
      <div className="mecha-atlas-links">
        {DISTRICTS.map((d, i) => (
          <section key={d.id}>
            <small>0{i + 1}</small>
            <h3>{d.title}</h3>
            <p>
              {d.id === 'blog'
                ? `${posts.length} 篇文章 · ${posts[0]?.date.slice(0, 10) ?? ''}`
                : d.id === 'projects'
                  ? `${projects.length} 个公开项目`
                  : d.subtitle}
            </p>
            <button
              onClick={() =>
                onAction({ type: 'enter-scene', sceneId: d.sceneId })
              }
            >
              <DoorOpen size={15} />
              进入舱室
            </button>
            <button onClick={() => onAction(d.action)}>
              直接查看
              <ArrowUpRight size={15} />
            </button>
          </section>
        ))}
      </div>
      <p className="mecha-atlas-note">
        探索进度保存在本机。文章、作品和个人档案随时可以打开。
      </p>
    </section>
  );
}

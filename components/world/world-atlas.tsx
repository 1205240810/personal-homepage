import { ArrowLeft, ArrowUpRight, DoorOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DISTRICTS, getScene } from '@/lib/world/registry';
import type { ArticleSummary } from '@/lib/content/source';
import type { WorldAction, WorldSnapshot } from '@/lib/world/types';
import projects from '@/content/data/projects.json';
import { DISCOVERIES } from '@/lib/world/discoveries';
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
          src="/art/mecha-isometric.png"
          alt="完整机甲的斜俯视图：头部航迹室、旧纸库和右手试作间，由环形栈道连接。"
        />
        {DISTRICTS.map((d, i) => (
          <button
            key={d.id}
            style={{ left: `${d.position.x}%`, top: `${d.position.y}%` }}
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
      {DISCOVERIES.some((d) => snapshot?.discoveries.includes(d.id)) && (
        <details className="discovery-notebook">
          <summary>旅途拾遗 · 留在口袋里的小事</summary>
          {DISCOVERIES.filter((d) => snapshot?.discoveries.includes(d.id)).map(
            (d) => (
              <div key={d.id}>
                <h3>{d.title}</h3>
                <p>{d.text}</p>
                {d.id === 'paper-crane' && (
                  <a href="/posts/cnblogs-13693028">翻到最早的那一页 ↗</a>
                )}
              </div>
            ),
          )}
        </details>
      )}
    </section>
  );
}

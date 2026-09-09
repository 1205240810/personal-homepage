import { ArrowUpRight } from 'lucide-react';

export function ProfileView({
  section = 'profile',
  onArticle,
}: {
  section?: string;
  onArticle?: (id: string) => void;
}) {
  return (
    <div className="profile-view">
      <span className="eyebrow">LEARNING EXAMPLE</span>
      <h2>关于这座小院</h2>
      <p className="profile-intro">
        这里保存了个人主页早期的场景交互实验。人物、树木、门、阅读抽屉和小游戏来自历史版本；文章与档案替换成教学内容。
      </p>
      <section>
        <h3>可以从这三件事开始</h3>
        <p>
          读 registry.ts 理解地图配置；沿 WorldAction 看一次物件互动；对照
          scenery.ts 和 navigation.ts 理解遮挡与碰撞。
        </p>
      </section>
      <p className="profile-intro">
        当前档案入口：{section}。历史接口名称保留，便于对照源码。
      </p>
      {onArticle && (
        <button
          className="quiet-link"
          onClick={() => onArticle('lesson-scene-definition')}
        >
          打开第一篇学习笔记 <ArrowUpRight size={14} />
        </button>
      )}
    </div>
  );
}

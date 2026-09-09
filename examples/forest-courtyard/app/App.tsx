import { useEffect, useState } from 'react';
import WorldShell from '@/components/world/world-shell';
import { ArticleView, ProfileView } from '@/components/world/archive-reader';
import { ProjectsView } from '@/components/world/projects-view';
import { articles, articleSummaries } from '@/lib/content/source';

function currentRoute() {
  return window.location.hash.slice(1) || '/';
}

export function App() {
  const [route, setRoute] = useState(currentRoute);
  useEffect(() => {
    const update = () => {
      setRoute(currentRoute());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  if (route === '/')
    return <WorldShell posts={articleSummaries} preview={false} />;
  const article = route.startsWith('/posts/')
    ? articles.find((p) => p.slug === route.slice(7))
    : undefined;
  return (
    <main className="example-page">
      <nav>
        <a href="#/">返回小院</a>
        <a href="#/archive">学习笔记</a>
        <a href="#/projects">项目外链</a>
      </nav>
      {route === '/archive' ? (
        <>
          <span className="eyebrow">LEARNING NOTES</span>
          <h1>从小院里学一点东西</h1>
          <p>三篇内置教学笔记，对应场景、交互和设计复盘。</p>
          <div className="example-posts">
            {articles.map((p) => (
              <a key={p.id} href={`#/posts/${p.slug}`}>
                <h2>{p.title}</h2>
                <p>{p.summary}</p>
              </a>
            ))}
          </div>
        </>
      ) : article ? (
        <ArticleView article={article} />
      ) : route === '/about' ? (
        <ProfileView />
      ) : route === '/projects' ? (
        <ProjectsView />
      ) : (
        <>
          <h1>没有这条学习路线</h1>
          <p>可以从上方返回小院或学习笔记。</p>
        </>
      )}
    </main>
  );
}

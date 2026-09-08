import { ProjectsView } from '@/components/world/projects-view';
export const metadata = { title: 'GitHub 项目 · 徒手拆机甲' };
export default function Projects() {
  return (
    <main className="reading-page">
      <header className="reading-header">
        <a href="/workbench">← 返回工作台</a>
        <a href="/archive">博客档案</a>
      </header>
      <span className="eyebrow">THE PROJECT STATION</span>
      <h1 className="standalone-title">GitHub 项目</h1>
      <ProjectsView />
    </main>
  );
}

import { SiteHeader } from '@/components/site/site-header';
import { ProjectsView } from '@/components/world/projects-view';
import { IcpFilingLink } from '@/components/icp-filing-link';
export const metadata = { title: 'GitHub 项目 · 徒手拆机甲' };
export default function Projects() {
  return (
    <main className="reading-page">
      <SiteHeader current="projects" />
      <span className="eyebrow">THE PROJECT STATION</span>
      <h1 className="standalone-title">GitHub 项目</h1>
      <ProjectsView />
      <footer className="reading-footer">
        <IcpFilingLink />
      </footer>
    </main>
  );
}

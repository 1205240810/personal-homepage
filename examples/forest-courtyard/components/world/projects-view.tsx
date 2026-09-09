import { ArrowUpRight, Code2, ExternalLink } from 'lucide-react';
import projects from '@/content/data/projects.json';
export function ProjectsView() {
  return (
    <div className="projects-view">
      <p className="projects-intro">
        这里演示如何把场景物件连接到外部项目。以下两项使用作者已有的公开项目资料。
      </p>
      <a
        className="github-profile"
        href="https://github.com/1205240810"
        target="_blank"
        rel="noreferrer"
      >
        <Code2 size={17} />
        <span>
          1205240810 <small>GitHub 主页与全部仓库</small>
        </span>
        <ArrowUpRight size={16} />
      </a>
      <div className="project-list">
        {projects.map((project, index) => (
          <article className="project-item" key={project.id}>
            <div className="project-meta">
              <span>
                {String(index + 1).padStart(2, '0')} / {project.language}
              </span>
              <time>{project.updatedAt.slice(0, 10)}</time>
            </div>
            <h3>{project.title}</h3>
            <p>{project.description}</p>
            <div className="project-actions">
              <a href={project.url} target="_blank" rel="noreferrer">
                查看仓库
                <ArrowUpRight size={14} />
              </a>
              {project.demoUrl && (
                <a href={project.demoUrl} target="_blank" rel="noreferrer">
                  打开演示
                  <ExternalLink size={13} />
                </a>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

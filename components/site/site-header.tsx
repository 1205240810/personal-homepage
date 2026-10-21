/* oxlint-disable nextjs/no-html-link-for-pages -- Full-document navigation releases each game's audio, timers and Workers, and avoids Vinext production prefetch errors. */
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { ThemeSwitcher } from '@/components/theme/theme-switcher';
import './site-header.css';

export type SiteSection =
  | 'workbench'
  | 'projects'
  | 'archive'
  | 'about'
  | 'games'
  | 'none';

/**
 * The one header used across the workbench, reading pages, the game room and
 * every ported game. Same brand, same links, same theme toggle everywhere;
 * pages only choose the current section and an optional back link.
 */
export function SiteHeader({
  current = 'none',
  back,
  fromExplore = false,
  label = '主要导航',
}: {
  current?: SiteSection;
  /** Contextual way back (e.g. a game → the game room), shown first. */
  back?: { href: string; label: string };
  /** Visitors who came from the 3D archive keep a way back to it. */
  fromExplore?: boolean;
  label?: string;
}) {
  const games = fromExplore ? '/games?from=explore' : '/games';
  const links: { id: SiteSection; href: string; text: string }[] = [
    { id: 'workbench', href: '/workbench', text: '工作台' },
    { id: 'projects', href: '/projects', text: '作品' },
    { id: 'archive', href: '/archive', text: '文章' },
    { id: 'about', href: '/about', text: '关于' },
    { id: 'games', href: games, text: '游戏室' },
  ];
  return (
    <header className="site-header">
      <a className="site-brand" href="/" aria-label="徒手拆机甲首页">
        <span className="site-brand-mark" aria-hidden="true" />
        <span>徒手拆机甲</span>
      </a>
      <nav className="site-nav" aria-label={label}>
        {back && (
          <a className="site-nav-back" href={back.href}>
            <ArrowLeft size={14} strokeWidth={1.8} aria-hidden="true" />
            {back.label}
          </a>
        )}
        {links.map((l) => (
          <a
            key={l.id}
            href={l.href}
            aria-current={current === l.id ? 'page' : undefined}
          >
            {l.text}
          </a>
        ))}
        <a className="site-nav-explore" href="/explore">
          {fromExplore ? '返回机甲' : '进入机甲'}
          <ArrowUpRight size={14} strokeWidth={1.8} aria-hidden="true" />
        </a>
      </nav>
      <ThemeSwitcher className="site-theme" />
    </header>
  );
}

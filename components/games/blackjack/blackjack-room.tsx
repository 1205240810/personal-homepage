'use client';

/* oxlint-disable nextjs/no-html-link-for-pages -- Full-document navigation releases game audio, timers and Worker ownership. */
import { useEffect, useState, type ComponentType } from 'react';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { IcpFilingLink } from '@/components/icp-filing-link';
import type { BlackjackGameProps } from './generated/BlackjackGame';
import './blackjack-room.css';

export function BlackjackRoom({
  fromExplore = false,
}: {
  fromExplore?: boolean;
}) {
  const [Game, setGame] = useState<ComponentType<BlackjackGameProps> | null>(
    null,
  );
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const returnPath = fromExplore ? '/games?from=explore' : '/games';

  useEffect(() => {
    let alive = true;
    // localStorage is read by the game initializer. Mount it after hydration so
    // saved modes/statistics never disagree with a server-rendered first frame.
    void import('./generated/BlackjackGame').then(
      (module) => {
        if (alive) setGame(() => module.BlackjackGame);
      },
      () => {
        if (alive) setFailed(true);
      },
    );
    return () => {
      alive = false;
    };
  }, [attempt]);

  return (
    <div className="blackjack-room-shell">
      <header className="blackjack-room-nav">
        <a href="/" className="blackjack-room-brand">
          徒手拆机甲
        </a>
        <nav aria-label="暗牌 21 导航">
          <a href={returnPath}>
            <ArrowLeft size={15} aria-hidden="true" />
            游戏室
          </a>
          <a href={fromExplore ? '/explore' : '/workbench'}>
            {fromExplore ? '返回机甲' : '工作台'}
            <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        </nav>
      </header>
      {Game ? (
        <Game
          persist
          onExit={() => window.location.assign(returnPath)}
          className="blackjack-integrated-table"
        />
      ) : (
        <main className="blackjack-room-loading" aria-live="polite">
          <span>THE QUIET TABLE</span>
          <h1>暗牌 21</h1>
          <p>{failed ? '牌桌暂时没有加载完成，请重试。' : '正在准备牌桌…'}</p>
          {failed && (
            <button
              onClick={() => {
                setFailed(false);
                setAttempt((value) => value + 1);
              }}
            >
              重新加载
            </button>
          )}
          <noscript>
            请开启 JavaScript 进入牌桌。你仍可以返回游戏室阅读介绍。
          </noscript>
        </main>
      )}
      <footer className="blackjack-room-footer">
        <span>随时开一局，也随时回来。</span>
        <IcpFilingLink />
      </footer>
    </div>
  );
}

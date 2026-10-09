'use client';

/* oxlint-disable nextjs/no-html-link-for-pages -- Full navigation releases each game's audio, listeners and AI calculations. */
import { useEffect, useState, type ComponentType } from 'react';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { IcpFilingLink } from '@/components/icp-filing-link';
import { getGame, type GameId } from '@/lib/games/catalog';
import './standalone-game-room.css';

type ImportedGameId = Extract<GameId, 'sudoku' | 'yahtzee' | 'stud'>;
type EmbeddedGameProps = {
  onExit?: () => void;
  persist?: boolean;
  globalKeyboard?: boolean;
  className?: string;
};
const loaders: Record<
  ImportedGameId,
  () => Promise<ComponentType<EmbeddedGameProps>>
> = {
  sudoku: () =>
    import('./sudoku/generated/SudokuGame').then((module) => module.SudokuGame),
  yahtzee: () =>
    import('./yahtzee/generated/YahtzeeGame').then(
      (module) => module.YahtzeeGame,
    ),
  stud: () =>
    import('./stud/generated/StudGame').then((module) => module.StudGame),
};
const editions = {
  sudoku: 'NINE ROOMS',
  yahtzee: 'THE BLUE HOUR',
  stud: 'VELVET FIVE',
};

export function StandaloneGameRoom({
  gameId,
  fromExplore = false,
}: {
  gameId: ImportedGameId;
  fromExplore?: boolean;
}) {
  const [loaded, setLoaded] = useState<{
    id: ImportedGameId;
    Game: ComponentType<EmbeddedGameProps>;
  } | null>(null);
  const [failed, setFailed] = useState<ImportedGameId | null>(null);
  const game = getGame(gameId);
  const Game = loaded?.id === gameId ? loaded.Game : null;
  const returnPath = fromExplore ? '/games?from=explore' : '/games';

  useEffect(() => {
    let alive = true;
    // The game initializer reads its own local save only after hydration.
    // Importing one component never starts another game's audio or Worker.
    void loaders[gameId]().then(
      (component) => {
        if (alive) setLoaded({ id: gameId, Game: component });
      },
      () => {
        if (alive) setFailed(gameId);
      },
    );
    return () => {
      alive = false;
    };
  }, [gameId]);

  return (
    <div className={`standalone-room standalone-room-${gameId}`}>
      <header className="standalone-room-nav">
        <a href="/" className="standalone-room-brand">
          徒手拆机甲
        </a>
        <nav aria-label={`${game.title}导航`}>
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
          globalKeyboard={false}
          className="arcade-integrated-game"
          onExit={() => window.location.assign(returnPath)}
        />
      ) : (
        <main
          className="standalone-room-loading"
          aria-live="polite"
          aria-busy={failed !== gameId}
        >
          <span>{editions[gameId]}</span>
          <h1>{game.title}</h1>
          <p>
            {failed === gameId
              ? '游戏暂时没有加载完成，请重试。'
              : '正在准备游戏…'}
          </p>
          {failed === gameId && (
            <button onClick={() => window.location.reload()}>重新加载</button>
          )}
          <noscript>请开启 JavaScript 游玩，或返回游戏室查看介绍。</noscript>
        </main>
      )}
      <footer className="standalone-room-footer">
        <span>进度保存在当前浏览器，随时回来继续。</span>
        <IcpFilingLink />
      </footer>
    </div>
  );
}

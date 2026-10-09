// Synced from standalone/blackjack/src by scripts/sync-blackjack.mjs. Edit the standalone source.
'use client';
import { useState } from 'react';
import { BlackjackGame, type BlackjackGameProps } from './BlackjackGame';
import { StandardBlackjackGame } from './StandardBlackjackGame';
import { HiLoTrainer } from './HiLoTrainer';
import './lobby.css';

export function BlackjackLobby(props: BlackjackGameProps) {
  const [mode, setMode] = useState<'standard' | 'casual' | 'hilo'>('standard');
  const [busy, setBusy] = useState(false);
  return <div className="bj-lobby">
    <nav className="bj-lobby-nav" aria-label="选择 21 点玩法">
      <div className="bj-lobby-tabs">
        <button aria-pressed={mode === 'standard'} disabled={busy} onClick={() => setMode('standard')}>
          标准规则<span>筹码与基本策略练习</span>
        </button>
        <button aria-pressed={mode === 'casual'} disabled={busy} onClick={() => setMode('casual')}>
          休闲对局<span>经典积分 / 策略庄家</span>
        </button>
        <button aria-pressed={mode === 'hilo'} disabled={busy} onClick={() => setMode('hilo')}>
          记牌练习<span>Hi-Lo 流水数（可选）</span>
        </button>
      </div>
      <p>{busy ? '本局结束后可切换玩法' : '各玩法的记录分别保存'}</p>
    </nav>
    {mode === 'standard'
      ? <StandardBlackjackGame onExit={props.onExit} persist={props.persist} className={props.className} onBusyChange={setBusy} />
      : mode === 'hilo'
        ? <HiLoTrainer persist={props.persist} />
        : <BlackjackGame {...props} onBusyChange={setBusy} />}
  </div>;
}

'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { GameId } from '@/lib/games/catalog';
import { GAME_RULES, type RulesSection } from '@/lib/games/rules';
import './game-rules.css';

const SECTIONS: [keyof Omit<RulesSection, 'goal' | 'keys'>, string][] = [
  ['play', '操作'],
  ['rules', '规则要点'],
  ['scoring', '胜负与计分'],
  ['tips', '小技巧'],
];

/**
 * 「规则与玩法」：默认收起的小按钮，展开为页内面板（手机上是底部浮层）。
 * 按 ? 切换，Esc 收起。不保存任何状态。
 */
export function GameRules({
  gameId,
  online = false,
  className,
}: {
  gameId: GameId;
  online?: boolean;
  className?: string;
}) {
  const entry = GAME_RULES[gameId];
  const data = (online && entry.online) || entry;
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      const t = e.target;
      if (
        t instanceof HTMLElement &&
        (t.isContentEditable || t.closest('input, textarea, select'))
      )
        return;
      if (e.key === '?') {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
        trigger.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (open) panel.current?.focus({ preventScroll: true });
  }, [open]);

  return (
    <div className={`game-rules${open ? ' is-open' : ''} ${className ?? ''}`}>
      <button
        ref={trigger}
        type="button"
        className="game-rules-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        title="规则与玩法（?）"
      >
        <span aria-hidden="true" className="game-rules-mark">
          ?
        </span>
        规则与玩法
      </button>
      {open && (
        <>
          <button
            type="button"
            className="game-rules-scrim"
            aria-label="收起规则"
            tabIndex={-1}
            onClick={() => setOpen(false)}
          />
          <div
            id={panelId}
            ref={panel}
            className="game-rules-panel"
            role="region"
            aria-label={`${online ? '联机' : ''}规则与玩法`}
            tabIndex={-1}
          >
            <header>
              <strong>
                规则与玩法{online && entry.online ? ' · 联机' : ''}
              </strong>
              <button
                type="button"
                className="game-rules-close"
                aria-label="收起规则"
                onClick={() => {
                  setOpen(false);
                  trigger.current?.focus({ preventScroll: true });
                }}
              >
                ×
              </button>
            </header>
            <p className="game-rules-goal">
              <b>目标</b>
              {data.goal}
            </p>
            <div className="game-rules-grid">
              {SECTIONS.map(([key, label]) => (
                <section key={key}>
                  <h3>{label}</h3>
                  <ul>
                    {data[key].map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </section>
              ))}
              {data.keys && data.keys.length > 0 && (
                <section>
                  <h3>快捷键</h3>
                  <dl className="game-rules-keys">
                    {data.keys.map(([k, v]) => (
                      <div key={k}>
                        <dt>
                          <kbd>{k}</kbd>
                        </dt>
                        <dd>{v}</dd>
                      </div>
                    ))}
                    <div>
                      <dt>
                        <kbd>?</kbd>
                      </dt>
                      <dd>打开 / 收起本说明</dd>
                    </div>
                  </dl>
                </section>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

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
  const [mobile, setMobile] = useState(false);
  const panelId = useId();
  const panel = useRef<HTMLElement | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = () => {
    const current = panel.current;
    if (current instanceof HTMLDialogElement && current.open) current.close();
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  };

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(max-width: 640px)');
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.defaultPrevented ||
        e.repeat ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        e.isComposing ||
        // oxlint-disable-next-line typescript/no-deprecated -- IMEs may omit isComposing on their final key event.
        e.keyCode === 229
      )
        return;
      const t = e.target;
      if (
        t instanceof HTMLElement &&
        (t.isContentEditable ||
          t.closest(
            'input, textarea, select, [contenteditable]:not([contenteditable="false"]), dialog, [role="dialog"], [aria-modal="true"]',
          ))
      )
        return;
      if (e.key === '?') {
        e.preventDefault();
        setOpen((v) => !v);
        if (open) trigger.current?.focus({ preventScroll: true });
      } else if (e.key === 'Escape' && open) {
        e.preventDefault();
        setOpen(false);
        trigger.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    const current = panel.current;
    if (!open || !current) return;
    const dialog = current instanceof HTMLDialogElement ? current : null;
    const overflow = document.body.style.overflow;
    if (dialog) {
      dialog.showModal();
      document.body.style.overflow = 'hidden';
    }
    current.focus({ preventScroll: true });
    return () => {
      if (dialog) {
        if (dialog.open) dialog.close();
        document.body.style.overflow = overflow;
      }
    };
  }, [open, mobile]);

  const Panel = mobile ? 'dialog' : 'div';

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
        <Panel
          id={panelId}
          ref={(node: HTMLDivElement | HTMLDialogElement | null) => {
            panel.current = node;
          }}
          className="game-rules-panel"
          role={mobile ? undefined : 'region'}
          aria-modal={mobile ? true : undefined}
          aria-label={`${online ? '联机' : ''}规则与玩法`}
          tabIndex={-1}
          onCancel={(e) => {
            e.preventDefault();
            close();
          }}
          onClick={(e) => {
            if (!mobile || e.target !== e.currentTarget) return;
            const bounds = e.currentTarget.getBoundingClientRect();
            if (
              e.clientX < bounds.left ||
              e.clientX > bounds.right ||
              e.clientY < bounds.top ||
              e.clientY > bounds.bottom
            )
              close();
          }}
          onKeyDown={(e) => {
            // Reading the rules must not trigger game actions underneath.
            e.stopPropagation();
            if (
              e.repeat ||
              e.ctrlKey ||
              e.metaKey ||
              e.altKey ||
              e.nativeEvent.isComposing
            )
              return;
            if (e.key === '?' || e.key === 'Escape') {
              e.preventDefault();
              close();
            }
          }}
        >
          <header>
            <strong>规则与玩法{online && entry.online ? ' · 联机' : ''}</strong>
            <button
              type="button"
              className="game-rules-close"
              aria-label="收起规则"
              onClick={close}
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
        </Panel>
      )}
    </div>
  );
}

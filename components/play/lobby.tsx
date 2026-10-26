'use client';

import { Check, Copy, Link2, LogIn, Plus, Wifi, WifiOff } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import type { PlayClient, PlaySnapshot } from '@/lib/multiplayer/client';
import { inviteLink, roomFromUrl } from './use-room';
import './play.css';

/**
 * Shared room chrome for every online game: create (with game-specific
 * options) or join by code, the invite link while waiting, and a quiet
 * connection / seats bar once seated.
 */
export function Lobby<V>({
  snap,
  client,
  game,
  options,
  children,
  createLabel = '创建房间',
}: {
  snap: PlaySnapshot<V>;
  client: PlayClient<V>;
  game: string;
  /** Options form; returns the options object when creating. */
  options?: { node: ReactNode; value: () => unknown };
  children?: ReactNode;
  createLabel?: string;
}) {
  const [code, setCode] = useState('');
  useEffect(() => {
    const fromUrl = roomFromUrl();
    if (fromUrl && snap.status === 'idle') client.join(fromUrl);
    // Only on mount.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!snap.code) return;
    const u = new URL(location.href);
    if (u.searchParams.get('room') !== snap.code) {
      u.searchParams.set('room', snap.code);
      history.replaceState(null, '', u);
    }
  }, [snap.code]);

  if (!snap.code) {
    return (
      <section className="play-lobby" aria-label="联机房间">
        <div className="play-card">
          <h3>开一个房间</h3>
          {options?.node}
          <button
            type="button"
            className="kit-primary"
            disabled={snap.status === 'connecting'}
            onClick={() => client.create(game, options?.value())}
          >
            <Plus size={15} aria-hidden="true" /> {createLabel}
          </button>
        </div>
        <form
          className="play-card"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) client.join(code);
          }}
        >
          <h3>加入房间</h3>
          <label className="play-code">
            <span>房间码</span>
            <input
              type="text"
              inputMode="text"
              autoCapitalize="characters"
              maxLength={6}
              placeholder="如 K7M2QX"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
          </label>
          <button type="submit" disabled={code.trim().length !== 6}>
            <LogIn size={15} aria-hidden="true" /> 加入
          </button>
        </form>
        {snap.status === 'connecting' && (
          <p className="kit-help play-wide">正在连接…</p>
        )}
        {snap.error && <p className="kit-bad play-wide">{snap.error}</p>}
      </section>
    );
  }
  return (
    <>
      <RoomBar snap={snap} />
      {snap.error && <p className="kit-bad">{snap.error}</p>}
      {children}
    </>
  );
}

function RoomBar<V>({ snap }: { snap: PlaySnapshot<V> }) {
  const [copied, setCopied] = useState(false);
  const waiting = snap.seats.some((s) => !s.taken);
  const link = snap.code ? inviteLink(snap.code) : '';
  const online = snap.status === 'open';
  return (
    <div className="play-bar" role="status">
      <span className={`play-conn${online ? ' is-on' : ''}`}>
        {online ? (
          <Wifi size={14} aria-hidden="true" />
        ) : (
          <WifiOff size={14} aria-hidden="true" />
        )}
        {online ? '已连接' : '重新连接中…'}
      </span>
      <span className="play-room">
        房间 <strong className="kit-mono">{snap.code}</strong>
      </span>
      <span className="play-seats">
        {snap.seats.map((s, i) => (
          <span
            key={i}
            className={`play-seat${s.online ? ' is-on' : ''}${i === snap.seat ? ' is-me' : ''}`}
          >
            {s.taken ? s.name : '空位'}
            {i === snap.seat && '（你）'}
            {s.taken && !s.online && ' · 离线'}
          </span>
        ))}
      </span>
      {waiting && (
        <span className="play-invite">
          <Link2 size={14} aria-hidden="true" />
          把链接发给朋友：
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(link).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
          >
            {copied ? (
              <Check size={14} aria-hidden="true" />
            ) : (
              <Copy size={14} aria-hidden="true" />
            )}
            {copied ? '已复制' : '复制邀请链接'}
          </button>
        </span>
      )}
    </div>
  );
}

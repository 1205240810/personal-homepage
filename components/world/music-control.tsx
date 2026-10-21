'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ListMusic,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  PopoverTitle,
} from '@/components/ui/popover';
import { PLAYLIST } from '@/lib/music/playlist';

const VOLUME_KEY = 'mecha-music-volume';
const STATE_KEY = 'mecha-music-state';

function clock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function MusicControl({ reading }: { reading: boolean }) {
  const audio = useRef<HTMLAudioElement>(null),
    intent = useRef(false),
    resumeAt = useRef(0),
    playRequest = useRef(0);
  const [playing, setPlaying] = useState(false),
    [volume, setVolume] = useState(0.2),
    [index, setIndex] = useState(0),
    [time, setTime] = useState(0),
    [duration, setDuration] = useState(PLAYLIST[0]?.duration ?? 0),
    [message, setMessage] = useState('');
  const track = PLAYLIST[index] ?? PLAYLIST[0];

  // 恢复上次的音量、曲目和进度（不会自动播放）。
  useEffect(() => {
    try {
      const raw = localStorage.getItem(VOLUME_KEY);
      const stored = Number(raw);
      if (raw !== null && Number.isFinite(stored) && stored >= 0 && stored <= 1)
        setVolume(stored);
      const state = JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
      const at = PLAYLIST.findIndex((t) => t.id === state?.id);
      if (at >= 0) {
        setIndex(at);
        setDuration(PLAYLIST[at].duration);
        const t = Number(state.time);
        if (Number.isFinite(t) && t > 0 && t < PLAYLIST[at].duration) {
          resumeAt.current = t;
          setTime(t);
        }
      }
    } catch {}
  }, []);

  const save = useCallback((id: string, t: number) => {
    try {
      localStorage.setItem(
        STATE_KEY,
        JSON.stringify({ id, time: Math.floor(t) }),
      );
    } catch {}
  }, []);

  useEffect(() => {
    const player = audio.current;
    if (player) player.volume = reading ? volume * 0.42 : volume;
  }, [volume, reading, index]);

  // A play promise may reject after pause or a source change. Only the latest
  // request for the current audio element may update the playback intent.
  const start = useCallback(async () => {
    const player = audio.current;
    if (!player) return;
    intent.current = true;
    if (document.hidden) return;
    const request = ++playRequest.current;
    setMessage('正在接入远处的旋律…');
    try {
      if (player.error) player.load();
      await player.play();
      if (request === playRequest.current && player === audio.current)
        setMessage('');
    } catch {
      if (request !== playRequest.current || player !== audio.current) return;
      intent.current = false;
      setPlaying(false);
      setMessage('音乐暂未开始，请再点一次。');
    }
  }, []);

  useEffect(() => {
    const player = audio.current;
    const visible = () => {
      if (!player) return;
      if (document.hidden) {
        ++playRequest.current;
        player.pause();
      } else if (intent.current) void start();
    };
    document.addEventListener('visibilitychange', visible);
    return () => {
      document.removeEventListener('visibilitychange', visible);
      player?.pause();
    };
  }, [index, start]);

  function toggle() {
    const player = audio.current;
    if (!player) return;
    if (intent.current) {
      intent.current = false;
      ++playRequest.current;
      player.pause();
      save(track.id, resumeAt.current || player.currentTime);
      setMessage('');
      return;
    }
    void start();
  }
  function go(next: number, autoplay = intent.current) {
    const n = (next + PLAYLIST.length) % PLAYLIST.length;
    ++playRequest.current;
    audio.current?.pause();
    resumeAt.current = 0;
    setPlaying(false);
    setMessage('');
    setIndex(n);
    setTime(0);
    setDuration(PLAYLIST[n].duration);
    save(PLAYLIST[n].id, 0);
    intent.current = autoplay;
  }
  // Each track gets its own audio element so late media events from the old
  // source cannot overwrite the new track's progress or playback state.
  useEffect(() => {
    if (intent.current) void start();
  }, [index, start]);

  const label = `${track.title} · ${track.artist}`;
  return (
    <div className="music-controls">
      <audio
        key={track.id}
        ref={audio}
        src={track.src}
        preload="none"
        onLoadedMetadata={(e) => {
          const p = e.currentTarget;
          if (Number.isFinite(p.duration)) setDuration(p.duration);
          if (resumeAt.current > 0 && resumeAt.current < p.duration)
            p.currentTime = resumeAt.current;
          resumeAt.current = 0;
          setTime(p.currentTime);
        }}
        onTimeUpdate={(e) => {
          if (resumeAt.current > 0) return;
          const t = e.currentTarget.currentTime;
          setTime(t);
          if (Math.floor(t) % 5 === 0) save(track.id, t);
        }}
        onPlaying={(e) => {
          if (!intent.current || document.hidden) {
            e.currentTarget.pause();
            return;
          }
          setPlaying(true);
          setMessage('');
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          if (intent.current) go(index + 1, true);
        }}
        onError={() => {
          ++playRequest.current;
          intent.current = false;
          setPlaying(false);
          setMessage('音乐加载失败，可以稍后重试。');
        }}
      />
      <Button
        variant="ghost"
        className="nav-button music-toggle"
        onClick={toggle}
        aria-label={
          playing ? `暂停背景音乐：${label}` : `播放背景音乐：${label}`
        }
        aria-pressed={playing}
      >
        {playing ? <Volume2 size={15} /> : <VolumeX size={15} />}
        <span>氛围音乐</span>
        {playing && (
          <span className="sound-bars" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        )}
      </Button>
      <Popover>
        <PopoverTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="music-options"
              aria-label="打开播放列表、音量与署名"
            />
          }
        >
          <ListMusic size={14} />
        </PopoverTrigger>
        <PopoverContent className="music-popover" align="end">
          <span className="eyebrow">
            来自远处的旋律 · {index + 1}/{PLAYLIST.length}
          </span>
          <PopoverTitle className="music-title">{track.title}</PopoverTitle>
          <p className="music-now">
            {track.artist} · {track.mood}
          </p>
          <fieldset className="music-transport" aria-label="播放控制">
            <button
              type="button"
              onClick={() => go(index - 1)}
              aria-label="上一首"
            >
              <SkipBack size={15} />
            </button>
            <button
              type="button"
              className="music-play"
              onClick={toggle}
              aria-label={playing ? '暂停' : '播放'}
            >
              {playing ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <button
              type="button"
              onClick={() => go(index + 1)}
              aria-label="下一首"
            >
              <SkipForward size={15} />
            </button>
          </fieldset>
          <div className="music-progress">
            <span>{clock(time)}</span>
            <input
              type="range"
              min="0"
              max={Math.max(1, Math.floor(duration))}
              step="1"
              value={Math.min(Math.floor(time), Math.floor(duration))}
              aria-label="播放进度"
              aria-valuetext={`${clock(time)} / ${clock(duration)}`}
              onChange={(event) => {
                const t = Number(event.target.value);
                const p = audio.current;
                setTime(t);
                if (p && p.readyState > 0) p.currentTime = t;
                else resumeAt.current = t;
                save(track.id, t);
              }}
            />
            <span>{clock(duration)}</span>
          </div>
          <label htmlFor="music-volume">
            音量 <span>{Math.round(volume * 100)}%</span>
          </label>
          <input
            id="music-volume"
            type="range"
            min="0"
            max="100"
            value={Math.round(volume * 100)}
            onChange={(event) => {
              const next = Number(event.target.value) / 100;
              setVolume(next);
              try {
                localStorage.setItem(VOLUME_KEY, String(next));
              } catch {}
            }}
          />
          <ol className="music-list" aria-label="播放列表">
            {PLAYLIST.map((t, i) => (
              <li key={t.id}>
                <button
                  type="button"
                  aria-current={i === index ? 'true' : undefined}
                  onClick={() => (i === index ? toggle() : go(i, true))}
                >
                  <span className="music-list-title">{t.title}</span>
                  <span className="music-list-time">{clock(t.duration)}</span>
                </button>
              </li>
            ))}
          </ol>
          <div className="music-credit">
            <a href={track.source} target="_blank" rel="noreferrer">
              「{track.title}」 {track.artist} · 原曲与授权页
            </a>
            <a href={track.license.url} target="_blank" rel="noreferrer">
              {track.license.name} · {track.changes}
            </a>
            <span>阅读时会轻轻降低音量；切到后台自动暂停。</span>
          </div>
        </PopoverContent>
      </Popover>
      {message && (
        <output className="music-message">
          {message}
        </output>
      )}
    </div>
  );
}

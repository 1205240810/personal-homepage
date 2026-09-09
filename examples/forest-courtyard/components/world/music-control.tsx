'use client';
import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
export function MusicControl({ reading }: { reading: boolean }) {
  const audio = useRef<HTMLAudioElement>(null),
    intent = useRef(false);
  const [playing, setPlaying] = useState(false),
    [volume, setVolume] = useState(0.2),
    [message, setMessage] = useState('');
  useEffect(() => {
    try {
      const raw = localStorage.getItem('forest-courtyard-example-music-volume');
      const stored = Number(raw);
      if (raw !== null && Number.isFinite(stored) && stored >= 0 && stored <= 1)
        setVolume(stored);
    } catch {}
  }, []);
  useEffect(() => {
    const player = audio.current;
    if (!player) return;
    player.volume = reading ? volume * 0.42 : volume;
  }, [volume, reading]);
  useEffect(() => {
    const player = audio.current;
    const visible = () => {
      if (!player) return;
      if (document.hidden) player.pause();
      else if (intent.current)
        player.play().catch(() => setMessage('点击音乐按钮继续播放。'));
    };
    document.addEventListener('visibilitychange', visible);
    return () => {
      document.removeEventListener('visibilitychange', visible);
      player?.pause();
    };
  }, []);
  async function toggle() {
    const player = audio.current;
    if (!player) return;
    if (intent.current) {
      intent.current = false;
      player.pause();
      setMessage('');
      return;
    }
    intent.current = true;
    setMessage('正在接入远处的旋律…');
    try {
      await player.play();
      setMessage('');
    } catch {
      intent.current = false;
      setMessage('音乐暂未开始，请再点一次。');
    }
  }
  return (
    <div className="music-controls">
      <audio
        ref={audio}
        src="/audio/morning.mp3"
        preload="none"
        loop
        onPlaying={() => {
          setPlaying(true);
          setMessage('');
        }}
        onPause={() => setPlaying(false)}
        onError={() => {
          intent.current = false;
          setPlaying(false);
          setMessage('音乐加载失败，可以稍后重试。');
        }}
      />
      <Button
        variant="ghost"
        className="nav-button music-toggle"
        onClick={toggle}
        aria-label={playing ? '暂停氛围音乐' : '播放氛围音乐'}
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
              aria-label="音乐音量与来源"
            />
          }
        >
          <SlidersHorizontal size={14} />
        </PopoverTrigger>
        <PopoverContent className="music-popover" align="end">
          <span className="eyebrow">来自远处的旋律</span>
          <h3>Morning</h3>
          <p>Kevin MacLeod · 2:33</p>
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
                localStorage.setItem('forest-courtyard-example-music-volume', String(next));
              } catch {}
            }}
          />
          <p>阅读时会轻轻降低音量。</p>
          <div className="music-credit">
            <a
              href="https://incompetech.com/music/royalty-free/index.html?isrc=USUAN2300003"
              target="_blank"
              rel="noreferrer"
            >
              Kevin MacLeod / incompetech.com
            </a>
            <a
              href="https://creativecommons.org/licenses/by/4.0/"
              target="_blank"
              rel="noreferrer"
            >
              CC BY 4.0 · 原曲未剪辑
            </a>
          </div>
        </PopoverContent>
      </Popover>
      {message && (
        <span className="music-message" role="status">
          {message}
        </span>
      )}
    </div>
  );
}

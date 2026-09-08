'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, ArrowRight, SunMedium } from 'lucide-react';
import { MusicControl } from '@/components/world/music-control';
import { ArrivalAtmosphere } from './arrival-atmosphere';
import './arrival.css';
export default function Arrival() {
  const [leaving, setLeaving] = useState(false);
  const [lightsOn, setLightsOn] = useState(false);
  const surface = useRef<HTMLElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  function enter(e: React.MouseEvent<HTMLAnchorElement>, href: string) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)
      return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    e.preventDefault();
    if (leaving) return;
    setLeaving(true);
    timer.current = setTimeout(() => location.assign(href), 280);
  }
  return (
    <main
      ref={surface}
      className={`arrival ${leaving ? 'is-leaving' : ''} ${lightsOn ? 'lights-on' : ''}`}
    >
      <div className="arrival-scene">
        <img
          className="arrival-art"
          src="/art/arrival-maintenance-hall.png"
          alt="高窗的日光落入维护馆，一台灰白色巨型机甲静静伫立，脚下是延伸至远处的金属地面。"
          fetchPriority="high"
        />
        <div className="arrival-window-light" aria-hidden="true" />
        <div className="arrival-inspection-beam" aria-hidden="true" />
        <ArrivalAtmosphere surfaceRef={surface} lightsOn={lightsOn} />
      </div>
      <div className="arrival-shade" aria-hidden="true" />
      <header className="arrival-header">
        <span className="arrival-brand">
          徒手拆机甲<span>个人档案馆</span>
        </span>
        <div className="arrival-controls">
          <button
            className="arrival-light-switch"
            aria-label={lightsOn ? '关闭检修灯' : '打开检修灯'}
            aria-pressed={lightsOn}
            onClick={() => setLightsOn((v) => !v)}
            title={lightsOn ? '关闭检修灯' : '打开检修灯'}
          >
            <SunMedium size={17} strokeWidth={1.4} />
            <span>检修灯</span>
          </button>
          <MusicControl reading={false} />
        </div>
      </header>
      <div className="arrival-copy">
        <p className="arrival-index">A PERSONAL ARCHIVE</p>
        <h1>
          徒手
          <br />
          拆机甲<span className="arrival-period">.</span>
        </h1>
        <p className="arrival-description">
          阅读文章与作品，
          <br />
          或者，走进机甲慢慢探索。
        </p>
        <nav className="arrival-choices" aria-label="选择进入方式">
          <a
            href="/workbench"
            onClick={(e) => enter(e, '/workbench')}
            className="arrival-workbench"
          >
            <span>
              打开工作台<small>直接阅读 · 试用作品</small>
            </span>
            <ArrowUpRight size={23} strokeWidth={1.4} />
          </a>
          <a
            href="/explore"
            onClick={(e) => enter(e, '/explore')}
            className="arrival-explore"
          >
            <span>
              进入机甲<small>自由行走 · 探索档案</small>
            </span>
            <ArrowRight size={23} strokeWidth={1.4} />
          </a>
        </nav>
      </div>
      <footer className="arrival-footer">
        <span>徒手拆机甲 · 算法、工程与日常</span>
      </footer>
    </main>
  );
}

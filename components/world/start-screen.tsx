'use client';
import { ArrowRight, BookOpen } from 'lucide-react';

export function StartScreen({
  ready,
  leaving,
  error,
  onEnter,
  onRead,
}: {
  ready: boolean;
  leaving: boolean;
  error: string;
  onEnter: () => void;
  onRead: () => void;
}) {
  return (
    <section
      className={`start-screen ${leaving ? 'is-leaving' : ''}`}
      aria-label="小院开始菜单"
    >
      <div className="start-copy">
        <p className="start-overline">
          <span /> A PLACE TO WANDER
        </p>
        <h1>
          留一点时间，
          <br />
          在这里<span>停一停。</span>
        </h1>
        <p className="start-description">
          代码、生活，与沿途收集的小事。
          <br />
          欢迎来到「徒手拆机甲」的林间小院。
        </p>
        <div className="start-actions">
          <button
            className="start-enter"
            onClick={onEnter}
            disabled={!ready || leaving}
          >
            <span>
              {ready ? '进入小院' : error ? '小院暂时未能打开' : '正在推开院门'}
            </span>
            <ArrowRight size={19} />
          </button>
          <button className="start-read" onClick={onRead} disabled={leaving}>
            <BookOpen size={16} />
            直接阅读
          </button>
        </div>
        <p className="start-footnote">不赶时间，也不必找齐所有秘密。</p>
      </div>
      <div className="start-colophon">
        <span>THE COURTYARD</span>
        <span>一个可以走进去的个人博客</span>
      </div>
    </section>
  );
}

export function WalkerPortrait() {
  return (
    <svg
      className="walker-portrait"
      viewBox="0 0 32 32"
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      <rect width="32" height="32" rx="5" fill="#e8edd8" />
      <path d="M6 32V25H10V22H22V25H26V32" fill="#6e8e7b" />
      <path d="M13 19H20V25H13Z" fill="#bb926f" />
      <path d="M9 9H24V19H21V22H12V19H9Z" fill="#dab58b" />
      <path d="M8 8H11V5H22V7H25V16H22V11H11V17H8Z" fill="#30464a" />
      <path d="M12 6H20V8H12Z" fill="#50685e" />
      <path d="M12 14H14V16H12ZM20 14H22V16H20Z" fill="#263a36" />
      <path d="M15 19H19V20H15Z" fill="#a77a5c" />
      <path d="M11 25H13V32H11ZM21 25H23V32H21Z" fill="#b5955f" />
    </svg>
  );
}

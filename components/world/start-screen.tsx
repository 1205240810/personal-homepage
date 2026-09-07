'use client';
import { ArrowRight, BookOpen } from 'lucide-react';

export function StartScreen({
  ready,
  resuming,
  leaving,
  error,
  onEnter,
  onRead,
}: {
  ready: boolean;
  resuming?: boolean;
  leaving: boolean;
  error: string;
  onEnter: () => void;
  onRead: () => void;
}) {
  return (
    <section
      className={`start-screen ${leaving ? 'is-leaving' : ''}`}
      aria-label="河谷开始菜单"
    >
      <div className="start-copy">
        <p className="start-overline">
          <span /> A RIVER JOURNAL
        </p>
        <h1>
          沿着河流，
          <br />
          走进<span>下一页。</span>
        </h1>
        <p className="start-description">
          有些故事，藏在路过的地方。
          <br />
          一段河谷小旅行，一本慢慢写下的个人博客。
        </p>
        <div className="start-actions">
          <button
            className="start-enter"
            onClick={onEnter}
            disabled={!ready || leaving}
          >
            <span>
              {ready
                ? resuming
                  ? '继续漫游'
                  : '开始漫游'
                : error
                  ? '场景暂时未能打开'
                  : '正在走进河谷'}
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
        <span>THE RIVER JOURNAL</span>
        <span>一个可以走进去的个人博客</span>
      </div>
    </section>
  );
}

export function WalkerPortrait() {
  return <span className="walker-portrait" aria-hidden="true" />;
}

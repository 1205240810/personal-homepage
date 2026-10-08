import type { CSSProperties } from 'react';
import type { Card } from './engine';

export const suitSymbols = { spades: '♠', hearts: '♥', clubs: '♣', diamonds: '♦' } as const;
const suitNames = { spades: '黑桃', hearts: '红桃', clubs: '梅花', diamonds: '方块' } as const;

export function PlayingCard({ card, hidden = false, index = 0 }: { card?: Card; hidden?: boolean; index?: number }) {
  if (!card) return <div className="bj-card-slot" aria-hidden="true"><span>♠</span></div>;
  const face = !hidden && <div className={`bj-card-face ${card.suit === 'hearts' || card.suit === 'diamonds' ? 'bj-card-red' : ''}`}>
    <div className="bj-card-corner"><b>{card.rank}</b><span>{suitSymbols[card.suit]}</span></div>
    <div className={`bj-card-art ${['J','Q','K'].includes(card.rank)?'bj-card-court':''}`} aria-hidden="true"><span>{suitSymbols[card.suit]}</span>{['J','Q','K'].includes(card.rank)&&<small>{card.rank==='K'?'KING':card.rank==='Q'?'QUEEN':'JACK'}</small>}</div>
    <div className="bj-card-corner bj-card-corner-bottom"><b>{card.rank}</b><span>{suitSymbols[card.suit]}</span></div>
  </div>;
  return <div className={`bj-card ${hidden ? 'bj-is-hidden' : ''}`} style={{ '--card-order': index } as CSSProperties} role="img" aria-label={hidden ? '暗牌' : `${suitNames[card.suit]} ${card.rank}`}>
    <div className="bj-card-flipper">{face}<div className="bj-card-back" aria-hidden="true"><div className="bj-card-pattern"><small>THE QUIET TABLE</small><span>♠</span><small>TWENTY ONE</small></div></div></div>
  </div>;
}

// Generates app/theme-tech.generated.css: the 「科技」theme's colour remap for
// page CSS that still uses hard-coded paper/ink literals. Run after editing any
// SOURCES file; `--check` (part of npm run check) fails when it is stale.
import fs from 'node:fs';
import postcss from 'postcss';
import valueParser from 'postcss-value-parser';

const OUT = 'app/theme-tech.generated.css';
const SOURCES = [
  'components/home/workbench.css',
  'components/home/project-library.css',
  'components/home/project-workbench.css',
  'components/home/pulse-game.css',
  'components/games/games.css',
  'components/games/mech-sweeper.css',
  'components/games/circuit-repair.css',
  'components/games/fault-finder.css',
  'components/games/signal-pulse.css',
  'components/games/standalone-game-room.css',
  'components/games/blackjack/blackjack-room.css',
  'components/games/sudoku/generated/sudoku.css',
  // Only the reading pages from the global sheet; explore keeps its artwork.
  [
    'app/globals.css',
    /reading-|article|archive|eyebrow|draft-notice|empty-message|standalone-title|vault-|prose|post-|katex-display/,
  ],
];
// Physical objects keep their real colours: playing cards, chips, dice, photos.
const KEEP =
  /card-face|playing-card|\bcard\b|-card\b(?!s)|chip|dice|\bdie\b|pip|felt|suit|photo|avatar|thumb|swatch|sg-cell-note/i;
// Page tokens remapped by hand in theme-tech.css.
const HAND_TOKENS = /^--(b|games|arcade|tech)-/;

const T = {
  surface: '#0a1520',
  surface2: '#0f1f2e',
  ink: '#dce8f4',
  muted: '#93a8bc',
  accent: '#3ddcff',
  rule: [61, 220, 255],
};

function parseColor(node) {
  if (node.type === 'word') {
    const v = node.value.toLowerCase();
    if (v === 'white') return { rgb: [255, 255, 255], a: 1 };
    if (v === 'black') return { rgb: [0, 0, 0], a: 1 };
    const m = /^#([0-9a-f]{3,8})$/.exec(v);
    if (!m || ![3, 4, 6, 8].includes(m[1].length)) return null;
    let h = m[1];
    if (h.length <= 4)
      h = h
        .split('')
        .map((c) => c + c)
        .join('');
    const n = (i) => parseInt(h.slice(i, i + 2), 16);
    return { rgb: [n(0), n(2), n(4)], a: h.length === 8 ? n(6) / 255 : 1 };
  }
  if (node.type === 'function' && /^rgba?$/.test(node.value)) {
    const parts = node.nodes
      .filter((n) => n.type === 'word')
      .map((n) => n.value);
    if (parts.length < 3) return null;
    const ch = parts.slice(0, 3).map(Number);
    if (ch.some((x) => !Number.isFinite(x))) return null;
    let a = parts[3] ?? '1';
    a = a.endsWith('%') ? parseFloat(a) / 100 : parseFloat(a);
    return { rgb: ch, a: Number.isFinite(a) ? a : 1 };
  }
  return null;
}
const lum = ([r, g, b]) => {
  const f = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const chroma = ([r, g, b]) => Math.max(r, g, b) - Math.min(r, g, b);
const withAlpha = (hex, a) =>
  a >= 1
    ? hex
    : `${hex}${Math.round(a * 255)
        .toString(16)
        .padStart(2, '0')}`;

function mapColor(color, role) {
  const L = lum(color.rgb),
    c = chroma(color.rgb);
  if (role === 'bg') {
    if (L < 0.35) return null; // already a dark surface
    return withAlpha(L > 0.8 ? T.surface : T.surface2, Math.max(color.a, 0.6));
  }
  if (role === 'text') {
    if (L >= 0.35) return null; // already light
    if (c >= 60) return T.accent;
    return L < 0.05 ? T.ink : T.muted;
  }
  if (role === 'border') {
    const a = Math.min(0.45, Math.max(0.16, color.a));
    return `rgb(${T.rule.join(' ')} / ${a.toFixed(2)})`;
  }
  // custom property: decide by its own lightness
  if (L >= 0.55) return withAlpha(L > 0.8 ? T.surface : T.surface2, color.a);
  if (L < 0.2) return c >= 60 ? T.accent : T.ink;
  return null;
}
const roleOf = (prop) => {
  if (prop.startsWith('--')) return 'var';
  if (/^background(-color|-image)?$/.test(prop)) return 'bg';
  if (
    /^(color|fill|stroke|caret-color|text-decoration-color|-webkit-text-fill-color)$/.test(
      prop,
    )
  )
    return 'text';
  if (
    /^(border(-(top|right|bottom|left|block|inline)(-(start|end))?)?(-color)?|outline(-color)?|column-rule(-color)?)$/.test(
      prop,
    )
  )
    return 'border';
  return null;
};
function transformValue(value, role) {
  if (/url\(/.test(value)) return null;
  const parsed = valueParser(value);
  let changed = false;
  parsed.walk((node) => {
    const color = parseColor(node);
    if (!color) return;
    const next = mapColor(color, role);
    if (!next) return false;
    node.type = 'word';
    node.value = next;
    delete node.nodes;
    changed = true;
    return false;
  });
  return changed ? valueParser.stringify(parsed.nodes) : null;
}
const scopeSelector = (sel) => {
  const s = sel.trim();
  if (/^(:root|html|body)\b/.test(s)) return null;
  return `html[data-theme='tech'] ${s}`;
};

export function build() {
  const out = postcss.root();
  for (const entry of SOURCES) {
    const [file, filter] = Array.isArray(entry) ? entry : [entry, null];
    const root = postcss.parse(fs.readFileSync(file, 'utf8'), { from: file });
    const section = [];
    root.walkRules((rule) => {
      if (
        rule.parent?.type === 'atrule' &&
        rule.parent.name.endsWith('keyframes')
      )
        return;
      if (filter && !filter.test(rule.selector)) return;
      if (KEEP.test(rule.selector)) return;
      const decls = [];
      rule.each((d) => {
        if (d.type !== 'decl') return;
        const role = roleOf(d.prop);
        if (!role || (role === 'var' && HAND_TOKENS.test(d.prop))) return;
        const next = transformValue(d.value, role);
        if (next)
          decls.push(
            postcss.decl({ prop: d.prop, value: next, important: d.important }),
          );
      });
      if (!decls.length) return;
      const selectors = rule.selectors.map(scopeSelector).filter(Boolean);
      if (!selectors.length) return;
      let node = postcss.rule({ selectors });
      decls.forEach((d) => node.append(d));
      // Re-wrap in the original @media / @supports chain.
      for (let p = rule.parent; p && p.type === 'atrule'; p = p.parent) {
        const wrap = postcss.atRule({ name: p.name, params: p.params });
        wrap.append(node);
        node = wrap;
      }
      section.push(node);
    });
    if (section.length) {
      out.append(postcss.comment({ text: ` ${file} ` }));
      section.forEach((n) => out.append(n));
    }
  }
  const header =
    '/* GENERATED by scripts/build-tech-theme.mjs — do not edit by hand.\n' +
    '   「科技」theme colour remap for hard-coded page colours. */\n';
  return header + out.toResult().css.replace(/\n{3,}/g, '\n\n') + '\n';
}

if (process.argv[1]?.endsWith('build-tech-theme.mjs')) {
  const css = build();
  if (process.argv.includes('--check')) {
    const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (current !== css) {
      console.error(`${OUT} is stale. Run: node scripts/build-tech-theme.mjs`);
      process.exit(1);
    }
    console.log(`${OUT} is up to date.`);
  } else {
    fs.writeFileSync(OUT, css);
    console.log(`Wrote ${OUT} (${css.split('\n').length} lines).`);
  }
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {
  normalizeTheme,
  THEME_BOOT_SCRIPT,
  THEME_STORAGE_KEY,
} from '../lib/theme.ts';

const boot = (stored: string | null, throws = false) => {
  const attrs: Record<string, string> = {};
  const root = {
    style: { colorScheme: '' },
    setAttribute: (k: string, v: string) => (attrs[k] = v),
  };
  vm.runInNewContext(THEME_BOOT_SCRIPT, {
    document: { documentElement: root },
    localStorage: {
      getItem: (k: string) => {
        if (throws) throw new Error('blocked');
        return k === THEME_STORAGE_KEY ? stored : null;
      },
    },
  });
  return { theme: attrs['data-theme'], scheme: root.style.colorScheme };
};

void test('首屏脚本：读取保存的主题，未知值和存储被禁用时回退默认', () => {
  assert.deepEqual(boot('tech'), { theme: 'tech', scheme: 'dark' });
  assert.deepEqual(boot(null), { theme: 'default', scheme: '' });
  assert.deepEqual(boot('neon<script>'), { theme: 'default', scheme: '' });
  assert.deepEqual(boot('tech', true), { theme: 'default', scheme: '' });
  assert.equal(normalizeTheme('tech'), 'tech');
  assert.equal(normalizeTheme(42), 'default');
});

void test('根布局在 <head> 内同步注入首屏脚本，并只对 <html> 抑制水合差异', () => {
  const layout = readFileSync('app/layout.tsx', 'utf8');
  assert.match(layout, /<html lang="zh-CN" suppressHydrationWarning>/);
  assert.match(
    layout,
    /<head>\s*<script dangerouslySetInnerHTML=\{\{ __html: THEME_BOOT_SCRIPT \}\}/,
  );
  assert.ok(
    layout.indexOf('theme-tech.generated.css') <
      layout.indexOf("'./theme-tech.css'"),
    '手写主题规则要排在生成规则之后',
  );
});

void test('所有站点导航都提供主题切换', () => {
  for (const file of [
    'components/home/arrival.tsx',
    'components/home/workbench.tsx',
    'components/games/game-room.tsx',
    'components/games/standalone-game-room.tsx',
    'components/games/blackjack/blackjack-room.tsx',
    'components/world/world-shell.tsx',
    'app/archive/page.tsx',
    'app/about/page.tsx',
    'app/projects/page.tsx',
    'app/vault/page.tsx',
    'app/posts/[slug]/page.tsx',
  ])
    assert.ok(
      /<(ThemeSwitcher|SiteHeader)\b/.test(readFileSync(file, 'utf8')),
      file,
    );
  assert.ok(
    readFileSync('components/site/site-header.tsx', 'utf8').includes(
      '<ThemeSwitcher',
    ),
  );
});

void test('工作台、阅读页、游戏室与移植游戏共用同一个站点页眉', () => {
  for (const file of [
    'components/home/workbench.tsx',
    'components/games/game-room.tsx',
    'components/games/standalone-game-room.tsx',
    'components/games/blackjack/blackjack-room.tsx',
    'app/archive/page.tsx',
    'app/about/page.tsx',
    'app/projects/page.tsx',
    'app/posts/[slug]/page.tsx',
  ])
    assert.match(readFileSync(file, 'utf8'), /<SiteHeader\b/, file);
});

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

void test('科技主题的文字色在所有底色上满足 WCAG AA（≥ 4.5:1）', () => {
  const css = readFileSync('app/theme-tech.css', 'utf8');
  const token = (name: string) => {
    const m = new RegExp(`--tech-${name}:\\s*(#[0-9a-f]{6})`).exec(css);
    assert.ok(m, name);
    return m[1];
  };
  for (const text of ['ink', 'muted', 'accent', 'accent-2', 'warn'])
    for (const bg of ['bg', 'surface', 'surface-2'])
      assert.ok(
        contrast(token(text), token(bg)) >= 4.5,
        `${text} on ${bg}: ${contrast(token(text), token(bg)).toFixed(2)}`,
      );
});

void test('科技主题克制：没有扫描线、流光、网格、HUD 角标和霓虹外发光', () => {
  const css = readFileSync('app/theme-tech.css', 'utf8');
  assert.ok(!/tech-sweep|repeating-linear-gradient|--tech-hud/.test(css));
  assert.ok(!/0 0 \d{2}px rgb\(/.test(css), '不应有大半径外发光');
  assert.ok(!/body::(before|after)/.test(css));
  assert.ok(
    !/animation:/.test(readFileSync('app/theme-tech.generated.css', 'utf8')),
  );
});

import type { Metadata, Viewport } from 'next';
import './tokens.css';
import './globals.css';
import './surfaces.css';
import './cards.css';
import 'katex/dist/katex.min.css';
import './theme-tech.generated.css';
import './theme-tech.css';
import { THEME_BOOT_SCRIPT } from '@/lib/theme';
export const metadata: Metadata = {
  title: '徒手拆机甲 · 作品、文章与探索',
  description:
    '徒手拆机甲的个人工作台。阅读文章，试用作品，也可以进入沉睡机甲档案馆慢慢探索。',
  icons: { icon: '/favicon.svg' },
  robots: { index: false, follow: false },
};
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // The boot script sets data-theme before hydration; only <html> may differ.
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

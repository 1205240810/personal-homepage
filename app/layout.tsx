import type { Metadata } from 'next';
import './globals.css';
import 'katex/dist/katex.min.css';
export const metadata: Metadata = {
  title: '徒手拆机甲 · 作品、文章与探索',
  description:
    '徒手拆机甲的个人工作台。阅读文章，试用作品，也可以进入沉睡机甲档案馆慢慢探索。',
  icons: { icon: '/favicon.svg' },
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}

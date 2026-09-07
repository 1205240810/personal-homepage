import type { Metadata } from 'next';
import './globals.css';
import 'katex/dist/katex.min.css';
export const metadata: Metadata = {
  title: '徒手拆机甲 · 林间小院',
  description: '在晴日下午的小院里，翻阅代码、项目与生活记录。',
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

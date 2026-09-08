import { ProfileView } from '@/components/world/archive-reader';
export const metadata = { title: '关于徒手拆机甲 · 徒手拆机甲' };
export default function About() {
  return (
    <main className="reading-page">
      <header className="reading-header">
        <a href="/">← 返回首页</a>
        <a href="/archive">全部记录</a>
      </header>
      <ProfileView />
    </main>
  );
}

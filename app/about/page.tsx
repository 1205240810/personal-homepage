import { ProfileView } from '@/components/world/archive-reader';
export const metadata = { title: '关于我 · 徒手拆机甲' };
export default function About() {
  return (
    <main className="reading-page">
      <header className="reading-header">
        <a href="/workbench">← 返回工作台</a>
        <a href="/archive">全部记录</a>
      </header>
      <ProfileView />
    </main>
  );
}

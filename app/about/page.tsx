import { SiteHeader } from '@/components/site/site-header';
import { ProfileView } from '@/components/world/archive-reader';
export const metadata = { title: '关于我 · 徒手拆机甲' };
export default function About() {
  return (
    <main className="reading-page">
      <SiteHeader current="about" />
      <ProfileView />
    </main>
  );
}

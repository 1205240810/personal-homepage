import { PrivateVault } from '@/components/world/private-vault';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: '私藏室 · 徒手拆机甲',
  robots: { index: false, follow: false, noarchive: true },
  referrer: 'no-referrer',
};
export default function VaultPage() {
  return (
    <main className="vault-page">
      <header className="reading-header">
        <a href="/explore?scene=undergraduate">← 回到旧纸库</a>
        <a href="/workbench">工作台</a>
      </header>
      <PrivateVault />
    </main>
  );
}

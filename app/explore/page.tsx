import WorldShell from '@/components/world/world-shell';
import { contentSource, isPrivatePreview } from '@/lib/content/source';
export const metadata = { title: '沉睡机甲档案馆 · 徒手拆机甲' };
export default async function Explore() {
  return (
    <WorldShell posts={await contentSource.list()} preview={isPrivatePreview} />
  );
}

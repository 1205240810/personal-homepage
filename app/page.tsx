import WorldShell from '@/components/world/world-shell';
import { contentSource, isPrivatePreview } from '@/lib/content/source';
export default async function Home() {
  return (
    <WorldShell posts={await contentSource.list()} preview={isPrivatePreview} />
  );
}

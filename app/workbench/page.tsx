import Workbench from '@/components/home/workbench';
import { contentSource } from '@/lib/content/source';
export default async function Home() {
  return <Workbench posts={await contentSource.list()} />;
}

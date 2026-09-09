import Arrival from '@/components/home/arrival';
import { headers } from 'next/headers';
import { ARRIVAL_ART } from '@/lib/arrival-art';

export const dynamic = 'force-dynamic';

export default async function Home() {
  await headers();
  // Pick on the server so hydration keeps the same image and only one is loaded.
  const art = ARRIVAL_ART[Math.floor(Math.random() * ARRIVAL_ART.length)];
  return <Arrival art={art} />;
}

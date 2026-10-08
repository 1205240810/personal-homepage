import { HoldemLab } from '@/components/games/holdem-lab';

export const metadata = { title: '德州扑克练习桌 · 徒手拆机甲' };
export default async function HoldemPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const params = await searchParams;
  return <HoldemLab fromExplore={params.from === 'explore'} />;
}

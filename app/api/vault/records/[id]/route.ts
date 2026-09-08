import { privateRecords } from '@/lib/private-vault/server';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return privateRecords(request, (await params).id);
}

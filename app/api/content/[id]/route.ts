import { contentSource } from '@/lib/content/source';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const doc = await contentSource.get(id);
  return doc
    ? Response.json(doc, {
        headers: { 'Cache-Control': 'private, max-age=60' },
      })
    : Response.json({ error: '内容不存在或尚未发布' }, { status: 404 });
}

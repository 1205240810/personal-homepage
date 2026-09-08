import { privateRecords } from '@/lib/private-vault/server';
export const GET = (request: Request) => privateRecords(request);

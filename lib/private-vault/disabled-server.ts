import 'server-only';

// Self-hosted public builds do not trust platform identity headers or load owner data.
const unavailable = () => Response.json(
  { error: '此部署未启用私藏室。' },
  {
    status: 503,
    headers: {
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
      'X-Content-Type-Options': 'nosniff',
    },
  },
);
export const vaultStatus = unavailable;
export const unlockVault = unavailable;
export const lockVault = unavailable;
export const privateRecords = unavailable;
export const bootstrapIdentity = () => new Response(null, { status: 404 });

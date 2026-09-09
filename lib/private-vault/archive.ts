import 'server-only';

type EncryptedArchive = { version: number; iv: string; ciphertext: string };

// The optional owner data stays on the owner's machine, outside Git.
const localArchives = import.meta.glob<EncryptedArchive>(
  './archive.encrypted.json',
  { eager: true, import: 'default' },
);
export const archive = localArchives['./archive.encrypted.json'] ?? null;

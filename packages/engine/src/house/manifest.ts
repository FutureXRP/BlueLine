/**
 * Deliverable manifest with per-artifact SHA-256 (pattern adopted from
 * reference/chatgpt-farmhouse, aligned with bible §11 golden discipline).
 * Uses WebCrypto so it runs in Node and the browser alike.
 */

export interface ManifestEntry {
  file: string;
  sha256: string;
  bytes: number;
}

export interface Manifest {
  geometryVersion: string;
  engineVersion: string;
  modelHash: string;
  files: ManifestEntry[];
}

export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function buildManifest(
  meta: { geometryVersion: string; engineVersion: string; modelHash: string },
  artifacts: Array<{ file: string; data: Uint8Array | string }>,
): Promise<Manifest> {
  const files: ManifestEntry[] = [];
  for (const a of [...artifacts].sort((p, q) => p.file.localeCompare(q.file))) {
    const bytes = typeof a.data === 'string' ? new TextEncoder().encode(a.data) : a.data;
    files.push({ file: a.file, sha256: await sha256Hex(bytes), bytes: bytes.byteLength });
  }
  return { ...meta, files };
}

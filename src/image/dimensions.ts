/**
 * Lightweight PNG/JPEG header parser for extracting image dimensions.
 * No external dependencies — reads binary headers directly.
 */

export interface ImageDimensions {
  width: number;
  height: number;
}

export function detectImageDimensions(buffer: Uint8Array): ImageDimensions | null {
  if (buffer.length < 24) return null;

  // PNG: 8-byte signature + IHDR chunk
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) {
    // Width at offset 16 (4 bytes big-endian), height at offset 20
    const width = (buffer[16] << 24) | (buffer[17] << 16) | (buffer[18] << 8) | buffer[19];
    const height = (buffer[20] << 24) | (buffer[21] << 16) | (buffer[22] << 8) | buffer[23];
    return { width, height };
  }

  // JPEG: SOI marker (0xFFD8)
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset < buffer.length - 1) {
      if (buffer[offset] !== 0xff) break;

      const marker = buffer[offset + 1];

      // SOFn markers (0xC0-0xCF except 0xC4/0xC8/0xCC)
      if (
        marker >= 0xc0 && marker <= 0xcf &&
        marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
      ) {
        if (offset + 9 > buffer.length) break;
        const height = (buffer[offset + 5] << 8) | buffer[offset + 6];
        const width = (buffer[offset + 7] << 8) | buffer[offset + 8];
        return { width, height };
      }

      // Skip to next marker
      if (offset + 3 >= buffer.length) break;
      const segmentLength = (buffer[offset + 2] << 8) | buffer[offset + 3];
      offset += 2 + segmentLength;
    }
  }

  return null;
}

export function detectContentType(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop();
  switch (ext) {
    case 'png': return 'image/png';
    case 'jpg': case 'jpeg': return 'image/jpeg';
    case 'gif': return 'image/gif';
    case 'webp': return 'image/webp';
    case 'svg': return 'image/svg+xml';
    default: return 'application/octet-stream';
  }
}

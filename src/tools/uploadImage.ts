import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { uploadImageViaApi } from '../db.js';
import { detectImageDimensions, detectContentType } from '../image/dimensions.js';

export const uploadImageSchema = z.object({
  filePath: z.string().describe('Absolute path to image file on disk'),
  width: z.number().optional().describe('Image width (auto-detected from file header if omitted)'),
  height: z.number().optional().describe('Image height (auto-detected from file header if omitted)'),
});

export async function handleUploadImage(args: z.infer<typeof uploadImageSchema>) {
  // Read the file from disk
  let fileBuffer: Buffer;
  try {
    fileBuffer = readFileSync(args.filePath);
  } catch (e) {
    return {
      content: [{ type: 'text' as const, text: `Failed to read file: ${(e as Error).message}` }],
      isError: true,
    };
  }

  const filename = basename(args.filePath);
  const contentType = detectContentType(filename);

  // Detect dimensions from file header if not provided
  let width = args.width;
  let height = args.height;
  if (!width || !height) {
    const detected = detectImageDimensions(new Uint8Array(fileBuffer));
    if (detected) {
      width = width ?? detected.width;
      height = height ?? detected.height;
    } else {
      width = width ?? 1920;
      height = height ?? 1080;
    }
  }

  // Upload via API (base64-encoded)
  const base64Data = fileBuffer.toString('base64');
  const result = await uploadImageViaApi(base64Data, filename, contentType);

  if (!result) {
    return {
      content: [{ type: 'text' as const, text: `Failed to upload image. In cloud mode, image upload is not yet supported.` }],
      isError: true,
    };
  }

  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({ url: result.url, width, height, filename }, null, 2),
    }],
  };
}

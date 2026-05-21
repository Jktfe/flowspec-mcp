import { z } from 'zod';
import { createScreenViaApi } from '../db.js';

export const createScreenSchema = z.object({
  projectId: z.string().describe('UUID of the project'),
  name: z.string().describe('Screen name (e.g. "Login Page")'),
  imageUrl: z.string().optional().describe('URL of the wireframe image (optional for skeleton screens)'),
  imageWidth: z.number().optional().describe('Image width in pixels (default: 1920)'),
  imageHeight: z.number().optional().describe('Image height in pixels (default: 1080)'),
  imageFilename: z.string().optional().describe('Original filename of the image'),
});

export async function handleCreateScreen(args: z.infer<typeof createScreenSchema>) {
  const screen = await createScreenViaApi(
    args.projectId,
    args.name,
    args.imageUrl,
    args.imageWidth,
    args.imageHeight,
    args.imageFilename
  );

  if (!screen) {
    return {
      content: [{ type: 'text' as const, text: `Failed to create screen — project not found: ${args.projectId}` }],
      isError: true,
    };
  }

  return {
    content: [{
      type: 'text' as const,
      text: `Created screen **${screen.name}** (id: ${screen.id})${args.imageUrl ? ` with image` : ' (no image)'}`,
    }],
  };
}

import { z } from 'zod';
import { updateScreenViaApi } from '../db.js';

export const updateScreenSchema = z.object({
  projectId: z.string().describe('UUID of the project'),
  screenId: z.string().describe('UUID of the screen to update'),
  name: z.string().optional().describe('New screen name'),
  imageUrl: z.string().optional().describe('New image URL'),
  imageWidth: z.number().optional().describe('New image width'),
  imageHeight: z.number().optional().describe('New image height'),
  imageFilename: z.string().optional().describe('New image filename'),
});

export async function handleUpdateScreen(args: z.infer<typeof updateScreenSchema>) {
  const { projectId, screenId, ...updates } = args;
  const screen = await updateScreenViaApi(projectId, screenId, updates);

  if (!screen) {
    return {
      content: [{ type: 'text' as const, text: `Failed to update screen — project or screen not found` }],
      isError: true,
    };
  }

  return {
    content: [{
      type: 'text' as const,
      text: `Updated screen **${screen.name}** (id: ${screen.id})`,
    }],
  };
}

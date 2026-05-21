import { z } from 'zod';
import { deleteScreenViaApi } from '../db.js';

export const deleteScreenSchema = z.object({
  projectId: z.string().describe('UUID of the project'),
  screenId: z.string().describe('UUID of the screen to delete'),
});

export async function handleDeleteScreen(args: z.infer<typeof deleteScreenSchema>) {
  const success = await deleteScreenViaApi(args.projectId, args.screenId);

  if (!success) {
    return {
      content: [{ type: 'text' as const, text: `Failed to delete screen — project or screen not found` }],
      isError: true,
    };
  }

  return {
    content: [{
      type: 'text' as const,
      text: `Deleted screen ${args.screenId}`,
    }],
  };
}

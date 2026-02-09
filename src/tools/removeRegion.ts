import { z } from 'zod';
import { removeRegionViaApi } from '../db.js';

export const removeRegionSchema = z.object({
  projectId: z.string().describe('UUID of the project'),
  screenId: z.string().describe('UUID of the screen'),
  regionId: z.string().describe('UUID of the region to remove'),
});

export async function handleRemoveRegion(args: z.infer<typeof removeRegionSchema>) {
  const success = await removeRegionViaApi(args.projectId, args.screenId, args.regionId);

  if (!success) {
    return {
      content: [{ type: 'text' as const, text: `Failed to remove region — project, screen, or region not found` }],
      isError: true,
    };
  }

  return {
    content: [{
      type: 'text' as const,
      text: `Removed region ${args.regionId}`,
    }],
  };
}

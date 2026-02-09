import { z } from 'zod';
import { updateRegionViaApi } from '../db.js';

export const updateRegionSchema = z.object({
  projectId: z.string().describe('UUID of the project'),
  screenId: z.string().describe('UUID of the screen'),
  regionId: z.string().describe('UUID of the region to update'),
  label: z.string().optional().describe('New region label'),
  position: z.object({
    x: z.number().describe('Left edge, percentage 0-100'),
    y: z.number().describe('Top edge, percentage 0-100'),
  }).optional().describe('New position in percentage coordinates'),
  size: z.object({
    width: z.number().describe('Width, percentage 0-100'),
    height: z.number().describe('Height, percentage 0-100'),
  }).optional().describe('New size in percentage coordinates'),
  elementIds: z.array(z.string()).optional().describe('New list of linked canvas node IDs'),
  componentNodeId: z.string().optional().describe('New component node ID'),
});

export async function handleUpdateRegion(args: z.infer<typeof updateRegionSchema>) {
  const { projectId, screenId, regionId, ...updates } = args;
  const region = await updateRegionViaApi(projectId, screenId, regionId, updates);

  if (!region) {
    return {
      content: [{ type: 'text' as const, text: `Failed to update region — project, screen, or region not found` }],
      isError: true,
    };
  }

  return {
    content: [{
      type: 'text' as const,
      text: `Updated region (id: ${region.id})`,
    }],
  };
}

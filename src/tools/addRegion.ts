import { z } from 'zod';
import { addRegionViaApi } from '../db.js';

export const addRegionSchema = z.object({
  projectId: z.string().describe('UUID of the project'),
  screenId: z.string().describe('UUID of the screen'),
  label: z.string().optional().describe('Region label (e.g. "Login Form")'),
  position: z.object({
    x: z.number().describe('Left edge, percentage 0-100'),
    y: z.number().describe('Top edge, percentage 0-100'),
  }).describe('Top-left corner position in percentage coordinates'),
  size: z.object({
    width: z.number().describe('Width, percentage 0-100'),
    height: z.number().describe('Height, percentage 0-100'),
  }).describe('Region size in percentage coordinates'),
  elementIds: z.array(z.string()).optional().describe('Canvas node IDs linked to this region'),
  componentNodeId: z.string().optional().describe('Component node ID when region is promoted'),
});

export async function handleAddRegion(args: z.infer<typeof addRegionSchema>) {
  const region = await addRegionViaApi(args.projectId, args.screenId, {
    label: args.label,
    position: args.position,
    size: args.size,
    elementIds: args.elementIds,
    componentNodeId: args.componentNodeId,
  });

  if (!region) {
    return {
      content: [{ type: 'text' as const, text: `Failed to add region — project or screen not found` }],
      isError: true,
    };
  }

  return {
    content: [{
      type: 'text' as const,
      text: `Added region **${region.label ?? region.id}** to screen (id: ${region.id})`,
    }],
  };
}

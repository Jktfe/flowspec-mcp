import { z } from 'zod';
import { updateNodeViaApi } from '../db.js';

export const updateNodeSchema = z.object({
  projectId: z.string().describe('UUID of the project'),
  nodeId: z.string().describe('UUID of the node to update'),
  data: z.record(z.unknown()).optional().describe('Node data fields to merge (label, type, constraints, etc.)'),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }).optional().describe('New canvas position'),
});

export async function handleUpdateNode(args: z.infer<typeof updateNodeSchema>) {
  const updates: Record<string, unknown> = {};
  if (args.data) updates.data = args.data;
  if (args.position) updates.position = args.position;

  const node = await updateNodeViaApi(args.projectId, args.nodeId, updates);

  if (!node) {
    return {
      content: [{ type: 'text' as const, text: `Node or project not found: ${args.nodeId}` }],
      isError: true,
    };
  }

  return {
    content: [{ type: 'text' as const, text: `Updated node ${args.nodeId}` }],
  };
}

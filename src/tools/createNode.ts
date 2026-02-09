import { z } from 'zod';
import { createNodeViaApi } from '../db.js';

export const createNodeSchema = z.object({
  projectId: z.string().describe('UUID of the project'),
  type: z.enum(['datapoint', 'component', 'transform', 'table']).describe('Node type'),
  position: z.object({
    x: z.number().describe('X position on canvas'),
    y: z.number().describe('Y position on canvas'),
  }).describe('Canvas position'),
  data: z.record(z.unknown()).describe('Node data (label, type, constraints, etc. — varies by node type)'),
});

export async function handleCreateNode(args: z.infer<typeof createNodeSchema>) {
  const node = await createNodeViaApi(args.projectId, {
    type: args.type,
    position: args.position,
    data: args.data,
  });

  if (!node) {
    return {
      content: [{ type: 'text' as const, text: `Failed to create node — project not found: ${args.projectId}` }],
      isError: true,
    };
  }

  return {
    content: [{
      type: 'text' as const,
      text: `Created ${args.type} node **${args.data.label ?? node.id}** (id: ${node.id})`,
    }],
  };
}

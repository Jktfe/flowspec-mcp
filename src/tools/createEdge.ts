import { z } from 'zod';
import { createEdgeViaApi } from '../db.js';

export const createEdgeSchema = z.object({
  projectId: z.string().describe('UUID of the project'),
  source: z.string().describe('Source node ID'),
  target: z.string().describe('Target node ID'),
  type: z.enum(['flows-to', 'derives-from', 'transforms', 'validates', 'contains']).optional()
    .describe('Edge type (defaults to flows-to)'),
  data: z.record(z.unknown()).optional().describe('Optional edge data'),
});

export async function handleCreateEdge(args: z.infer<typeof createEdgeSchema>) {
  const edge = await createEdgeViaApi(args.projectId, {
    source: args.source,
    target: args.target,
    type: args.type ? `typed` : 'typed',
    data: { edgeType: args.type ?? 'flows-to', ...(args.data ?? {}) },
  });

  if (!edge) {
    return {
      content: [{ type: 'text' as const, text: `Failed to create edge — project or nodes not found` }],
      isError: true,
    };
  }

  return {
    content: [{
      type: 'text' as const,
      text: `Created edge ${args.source} → ${args.target} (type: ${args.type ?? 'flows-to'}, id: ${edge.id})`,
    }],
  };
}

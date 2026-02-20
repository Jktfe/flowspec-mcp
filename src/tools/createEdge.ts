import { z } from 'zod';
import { createEdgeViaApi } from '../db.js';

export const createEdgeSchema = z.object({
  projectId: z.string().describe('UUID of the project'),
  source: z.string().describe('Source node ID'),
  target: z.string().describe('Target node ID'),
  sourceHandle: z.enum(['source-left', 'source-top', 'source-right', 'source-bottom']).nullable().optional()
    .describe('Source connection handle (null = auto-route)'),
  targetHandle: z.enum(['target-left', 'target-top', 'target-right', 'target-bottom']).nullable().optional()
    .describe('Target connection handle (null = auto-route)'),
  data: z.record(z.unknown()).optional().describe('Optional edge data'),
});

export async function handleCreateEdge(args: z.infer<typeof createEdgeSchema>) {
  const edge = await createEdgeViaApi(args.projectId, {
    source: args.source,
    target: args.target,
    type: 'typed',
    sourceHandle: args.sourceHandle ?? null,
    targetHandle: args.targetHandle ?? null,
    data: { edgeType: 'flows-to', ...(args.data ?? {}) },
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
      text: `Created edge ${args.source} → ${args.target} (type: flows-to, id: ${edge.id})`,
    }],
  };
}

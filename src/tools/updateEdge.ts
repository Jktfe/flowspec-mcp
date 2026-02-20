import { z } from 'zod';
import { updateEdgeViaApi } from '../db.js';

export const updateEdgeSchema = z.object({
  projectId: z.string().describe('UUID of the project'),
  edgeId: z.string().describe('UUID of the edge to update'),
  type: z.enum(['flows-to']).optional()
    .describe('Edge type (always flows-to)'),
  label: z.string().optional().describe('Edge label text'),
  sourceHandle: z.enum(['source-left', 'source-top', 'source-right', 'source-bottom']).nullable().optional()
    .describe('Source connection handle (null = auto-route)'),
  targetHandle: z.enum(['target-left', 'target-top', 'target-right', 'target-bottom']).nullable().optional()
    .describe('Target connection handle (null = auto-route)'),
  data: z.record(z.unknown()).optional().describe('Additional edge data to merge'),
});

export async function handleUpdateEdge(args: z.infer<typeof updateEdgeSchema>) {
  const updates: Record<string, unknown> = {};

  // Edge-level properties
  if (args.sourceHandle !== undefined) updates.sourceHandle = args.sourceHandle;
  if (args.targetHandle !== undefined) updates.targetHandle = args.targetHandle;

  // Data-level properties (merged into edge.data)
  const dataUpdates: Record<string, unknown> = {};
  if (args.type !== undefined) dataUpdates.edgeType = args.type;
  if (args.label !== undefined) dataUpdates.label = args.label;
  if (args.data) Object.assign(dataUpdates, args.data);
  if (Object.keys(dataUpdates).length > 0) updates.data = dataUpdates;

  const edge = await updateEdgeViaApi(args.projectId, args.edgeId, updates);

  if (!edge) {
    return {
      content: [{ type: 'text' as const, text: `Failed to update edge — project or edge not found` }],
      isError: true,
    };
  }

  const parts = [`Updated edge ${edge.id}`];
  if (args.type) parts.push(`type → ${args.type}`);
  if (args.sourceHandle !== undefined) parts.push(`sourceHandle → ${args.sourceHandle ?? 'auto'}`);
  if (args.targetHandle !== undefined) parts.push(`targetHandle → ${args.targetHandle ?? 'auto'}`);

  return {
    content: [{ type: 'text' as const, text: parts.join(', ') }],
  };
}

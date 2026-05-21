import { z } from 'zod';
import { deleteEdgeViaApi } from '../db.js';

export const deleteEdgeSchema = z.object({
  projectId: z.string().describe('UUID of the project'),
  edgeId: z.string().describe('UUID of the edge to delete'),
});

export async function handleDeleteEdge(args: z.infer<typeof deleteEdgeSchema>) {
  const ok = await deleteEdgeViaApi(args.projectId, args.edgeId);

  if (!ok) {
    return {
      content: [{ type: 'text' as const, text: `Edge or project not found: ${args.edgeId}` }],
      isError: true,
    };
  }

  return {
    content: [{ type: 'text' as const, text: `Deleted edge ${args.edgeId}` }],
  };
}

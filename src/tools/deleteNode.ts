import { z } from 'zod';
import { deleteNodeViaApi } from '../db.js';

export const deleteNodeSchema = z.object({
  projectId: z.string().describe('UUID of the project'),
  nodeId: z.string().describe('UUID of the node to delete (connected edges are also removed)'),
});

export async function handleDeleteNode(args: z.infer<typeof deleteNodeSchema>) {
  const ok = await deleteNodeViaApi(args.projectId, args.nodeId);

  if (!ok) {
    return {
      content: [{ type: 'text' as const, text: `Node or project not found: ${args.nodeId}` }],
      isError: true,
    };
  }

  return {
    content: [{ type: 'text' as const, text: `Deleted node ${args.nodeId} and its connected edges` }],
  };
}

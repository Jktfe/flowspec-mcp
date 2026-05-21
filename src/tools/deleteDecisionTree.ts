import { z } from 'zod';
import { deleteDecisionTreeViaApi } from '../db.js';

export const deleteDecisionTreeSchema = z.object({
  projectId: z.string().describe('UUID of the project'),
  treeId: z.string().describe('ID of the decision tree to delete'),
});

export async function handleDeleteDecisionTree(args: z.infer<typeof deleteDecisionTreeSchema>) {
  const ok = await deleteDecisionTreeViaApi(args.projectId, args.treeId);

  if (!ok) {
    return {
      content: [{ type: 'text' as const, text: `Decision tree not found: ${args.treeId}` }],
      isError: true,
    };
  }

  return {
    content: [{ type: 'text' as const, text: `Deleted decision tree ${args.treeId}` }],
  };
}

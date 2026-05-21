import { z } from 'zod';
import { listDecisionTrees } from '../db.js';

export const listDecisionTreesSchema = z.object({
  projectId: z.string().describe('UUID of the project'),
});

export async function handleListDecisionTrees(args: z.infer<typeof listDecisionTreesSchema>) {
  const trees = await listDecisionTrees(args.projectId);

  if (trees.length === 0) {
    return {
      content: [{ type: 'text' as const, text: `No decision trees found for project ${args.projectId}` }],
    };
  }

  const lines = trees.map(t =>
    `- **${t.name}** (${t.id})\n  From: ${t.generated_from_node_label ?? 'unknown'} | Depth: ${t.trace_depth} | Updated: ${t.updated_at}`
  );

  return {
    content: [{ type: 'text' as const, text: `Found ${trees.length} decision tree(s):\n\n${lines.join('\n')}` }],
  };
}

import { z } from 'zod';
import { searchNodes } from '../db.js';

export const searchNodesSchema = z.object({
  query: z.string().describe('Search term to match against node labels'),
  nodeType: z
    .enum(['datapoint', 'component', 'transform'])
    .optional()
    .describe('Filter by node type'),
});

export async function handleSearchNodes(args: z.infer<typeof searchNodesSchema>) {
  const results = await searchNodes(args.query, args.nodeType);

  if (results.length === 0) {
    return {
      content: [{ type: 'text' as const, text: `No nodes found matching "${args.query}".` }],
    };
  }

  const lines = results.map(
    (r) => `- **${r.label}** (${r.nodeType}) in project "${r.projectName}" (node: ${r.nodeId}, project: ${r.projectId})`
  );

  return {
    content: [{ type: 'text' as const, text: `Found ${results.length} node(s):\n\n${lines.join('\n')}` }],
  };
}

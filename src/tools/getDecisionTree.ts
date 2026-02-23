import { z } from 'zod';
import { getDecisionTree } from '../db.js';

export const getDecisionTreeSchema = z.object({
  projectId: z.string().describe('UUID of the project'),
  treeId: z.string().describe('ID of the decision tree'),
});

export async function handleGetDecisionTree(args: z.infer<typeof getDecisionTreeSchema>) {
  const tree = await getDecisionTree(args.projectId, args.treeId);

  if (!tree) {
    return {
      content: [{ type: 'text' as const, text: `Decision tree not found: ${args.treeId}` }],
      isError: true,
    };
  }

  const { tree_data } = tree;
  const decisionCount = tree_data.nodes.filter(n => n.type === 'decision').length;
  const outcomeCount = tree_data.nodes.filter(n => n.type === 'outcome').length;

  const summary = [
    `# ${tree.name}`,
    tree.description ? `\n${tree.description}` : '',
    `\nGenerated from: ${tree.generated_from_node_label ?? 'unknown'} (trace depth: ${tree.trace_depth})`,
    `Nodes: ${tree_data.nodes.length} (${decisionCount} decisions, ${outcomeCount} outcomes)`,
    `Edges: ${tree_data.edges.length}`,
    `Root: ${tree_data.rootNodeId}`,
    '',
    '## Tree Structure',
    '',
    JSON.stringify(tree_data, null, 2),
  ].join('\n');

  return {
    content: [{ type: 'text' as const, text: summary }],
  };
}

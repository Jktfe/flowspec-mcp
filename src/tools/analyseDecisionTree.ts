import { z } from 'zod';
import { getDecisionTree } from '../db.js';

export const analyseDecisionTreeSchema = z.object({
  projectId: z.string().describe('UUID of the project'),
  treeId: z.string().describe('ID of the decision tree to analyse'),
});

export async function handleAnalyseDecisionTree(args: z.infer<typeof analyseDecisionTreeSchema>) {
  const tree = await getDecisionTree(args.projectId, args.treeId);

  if (!tree) {
    return {
      content: [{ type: 'text' as const, text: `Decision tree not found: ${args.treeId}` }],
      isError: true,
    };
  }

  const { tree_data } = tree;
  const nodes = tree_data.nodes;
  const edges = tree_data.edges;

  // Count by type
  const typeCounts: Record<string, number> = {};
  for (const node of nodes) {
    typeCounts[node.type] = (typeCounts[node.type] ?? 0) + 1;
  }

  // Find leaf nodes (no outgoing edges)
  const sourceIds = new Set(edges.map(e => e.source));
  const leafNodes = nodes.filter(n => !sourceIds.has(n.id));

  // Find orphan nodes (no edges at all)
  const targetIds = new Set(edges.map(e => e.target));
  const connectedIds = new Set([...sourceIds, ...targetIds]);
  const orphanNodes = nodes.filter(n => !connectedIds.has(n.id) && n.id !== tree_data.rootNodeId);

  // Compute max depth via BFS from root
  let maxDepth = 0;
  const childMap = new Map<string, string[]>();
  for (const edge of edges) {
    const children = childMap.get(edge.source) ?? [];
    children.push(edge.target);
    childMap.set(edge.source, children);
  }

  const queue: Array<{ id: string; depth: number }> = [{ id: tree_data.rootNodeId, depth: 0 }];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    maxDepth = Math.max(maxDepth, depth);
    for (const child of childMap.get(id) ?? []) {
      queue.push({ id: child, depth: depth + 1 });
    }
  }

  // Outcome distribution
  const outcomes = nodes.filter(n => n.type === 'outcome');
  const outcomeResults: Record<string, number> = {};
  for (const o of outcomes) {
    const result = o.outcome?.result ?? 'unspecified';
    outcomeResults[result] = (outcomeResults[result] ?? 0) + 1;
  }

  // Decision nodes missing branches (< 2 outgoing edges)
  const decisionNodes = nodes.filter(n => n.type === 'decision');
  const underBranched = decisionNodes.filter(d => {
    const outgoing = edges.filter(e => e.source === d.id);
    return outgoing.length < 2;
  });

  const lines = [
    `# Analysis: ${tree.name}`,
    '',
    `## Summary`,
    `- **Total nodes:** ${nodes.length}`,
    `- **Total edges:** ${edges.length}`,
    `- **Max depth:** ${maxDepth}`,
    `- **Leaf nodes:** ${leafNodes.length}`,
    '',
    `## Node Types`,
    ...Object.entries(typeCounts).map(([type, count]) => `- ${type}: ${count}`),
    '',
    `## Outcomes`,
    outcomes.length === 0
      ? '- No outcome nodes found'
      : Object.entries(outcomeResults).map(([result, count]) => `- ${result}: ${count}`).join('\n'),
    '',
    `## Issues`,
  ];

  const issues: string[] = [];
  if (orphanNodes.length > 0) {
    issues.push(`- **${orphanNodes.length} orphan node(s)** (disconnected): ${orphanNodes.map(n => n.label).join(', ')}`);
  }
  if (underBranched.length > 0) {
    issues.push(`- **${underBranched.length} decision node(s) with < 2 branches**: ${underBranched.map(n => n.label).join(', ')}`);
  }
  if (leafNodes.some(n => n.type !== 'outcome')) {
    const nonOutcomeLeaves = leafNodes.filter(n => n.type !== 'outcome');
    issues.push(`- **${nonOutcomeLeaves.length} leaf node(s) that aren't outcomes**: ${nonOutcomeLeaves.map(n => `${n.label} (${n.type})`).join(', ')}`);
  }

  if (issues.length === 0) {
    lines.push('- No issues found — tree structure looks good');
  } else {
    lines.push(...issues);
  }

  return {
    content: [{ type: 'text' as const, text: lines.join('\n') }],
  };
}

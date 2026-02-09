import { z } from 'zod';
import { getProject, updateProjectViaApi } from '../db.js';
import { computeAutoLayout } from '../layout/autoLayout.js';

export const autoLayoutSchema = z.object({
  projectId: z.string().describe('UUID of the project'),
  direction: z.enum(['TB', 'BT', 'LR', 'RL']).optional().describe('Layout direction (default: TB — top-to-bottom)'),
  pinnedNodeIds: z.array(z.string()).optional().describe('Node IDs to keep in their current positions'),
});

export async function handleAutoLayout(args: z.infer<typeof autoLayoutSchema>) {
  const project = await getProject(args.projectId);
  if (!project) {
    return {
      content: [{ type: 'text' as const, text: `Project not found: ${args.projectId}` }],
      isError: true,
    };
  }

  const nodes = project.canvas_state.nodes ?? [];
  const edges = project.canvas_state.edges ?? [];

  if (nodes.length === 0) {
    return {
      content: [{ type: 'text' as const, text: 'No nodes to layout' }],
    };
  }

  const direction = args.direction ?? 'TB';
  const pinnedNodeIds = new Set(args.pinnedNodeIds ?? []);

  const positions = computeAutoLayout(nodes, edges, { rankdir: direction, pinnedNodeIds });

  // Apply positions to nodes
  let movedCount = 0;
  for (const node of nodes) {
    const pos = positions.get(node.id);
    if (pos) {
      node.position = pos;
      movedCount++;
    }
  }

  const updated = await updateProjectViaApi(args.projectId, {
    canvas_state: project.canvas_state,
  });

  if (!updated) {
    return {
      content: [{ type: 'text' as const, text: `Failed to save layout changes` }],
      isError: true,
    };
  }

  return {
    content: [{
      type: 'text' as const,
      text: `Auto-layout complete — repositioned ${movedCount} nodes (direction: ${direction}, pinned: ${pinnedNodeIds.size})`,
    }],
  };
}

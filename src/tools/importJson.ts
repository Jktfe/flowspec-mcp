import { z } from 'zod';
import { getProject, updateProjectViaApi } from '../db.js';
import { importFromJson } from '../import/jsonImporter.js';
import { computeAutoLayout } from '../layout/autoLayout.js';
import type { CanvasNode, CanvasEdge } from '../types.js';

export const importJsonSchema = z.object({
  projectId: z.string().describe('UUID of the target project'),
  json: z.string().describe('JSON spec string (FlowSpec v1.2.0 format)'),
  autoLayout: z.boolean().optional().describe('Run dagre auto-layout after import (default: true)'),
  layoutDirection: z.enum(['TB', 'BT', 'LR', 'RL']).optional().describe('Layout direction (default: TB)'),
  merge: z.boolean().optional().describe('true = add to existing canvas, false = replace (default: false)'),
});

export async function handleImportJson(args: z.infer<typeof importJsonSchema>) {
  // Parse JSON string
  let spec: Record<string, unknown>;
  try {
    spec = JSON.parse(args.json) as Record<string, unknown>;
  } catch (e) {
    return {
      content: [{ type: 'text' as const, text: `JSON parse error: ${(e as Error).message}` }],
      isError: true,
    };
  }

  if (!spec || typeof spec !== 'object') {
    return {
      content: [{ type: 'text' as const, text: 'Invalid JSON: expected an object at the top level' }],
      isError: true,
    };
  }

  // Import JSON → nodes/edges/screens
  // In merge mode, pass existing node IDs so edges referencing them aren't skipped
  let existingNodeIds: Set<string> | undefined;
  if (args.merge) {
    const existingProject = await getProject(args.projectId);
    if (existingProject) {
      existingNodeIds = new Set(
        (existingProject.canvas_state?.nodes ?? []).map((n: CanvasNode) => n.id)
      );
    }
  }

  let result;
  try {
    result = importFromJson(spec, existingNodeIds);
  } catch (e) {
    return {
      content: [{ type: 'text' as const, text: `Import error: ${(e as Error).message}` }],
      isError: true,
    };
  }

  // Apply auto-layout if requested (default: true)
  const shouldLayout = args.autoLayout !== false;
  if (shouldLayout && result.nodes.length > 0) {
    const direction = args.layoutDirection ?? 'TB';
    const positions = computeAutoLayout(
      result.nodes,
      result.edges,
      { rankdir: direction, pinnedNodeIds: new Set() }
    );
    for (const node of result.nodes) {
      const pos = positions.get(node.id);
      if (pos) node.position = pos;
    }
  }

  // Build canvas state
  let nodes: CanvasNode[];
  let edges: CanvasEdge[];
  let screens = result.screens;

  if (args.merge) {
    // Merge mode: add imported nodes/edges/screens to existing
    const project = await getProject(args.projectId);
    if (!project) {
      return {
        content: [{ type: 'text' as const, text: `Project not found: ${args.projectId}` }],
        isError: true,
      };
    }
    const existing = project.canvas_state;
    nodes = [...(existing.nodes ?? []), ...result.nodes];
    edges = [...(existing.edges ?? []), ...result.edges];
    screens = [...(existing.screens ?? []), ...result.screens];
  } else {
    // Replace mode: imported data replaces existing canvas
    nodes = result.nodes;
    edges = result.edges;
  }

  const canvasState = { nodes, edges, screens };
  const updated = await updateProjectViaApi(args.projectId, { canvas_state: canvasState });

  if (!updated) {
    return {
      content: [{ type: 'text' as const, text: `Failed to update project — not found: ${args.projectId}` }],
      isError: true,
    };
  }

  const { stats } = result;
  const lines = [
    `Imported JSON into project **${updated.name}**`,
    '',
    `| Metric | Count |`,
    `|--------|-------|`,
    `| Data points | ${stats.dataPoints} |`,
    `| Components | ${stats.components} |`,
    `| Transforms | ${stats.transforms} |`,
    `| Tables | ${stats.tables} |`,
    `| Edges | ${stats.edges} |`,
    `| Screens | ${result.screens.length} |`,
    `| Skipped nodes | ${stats.skippedNodes} |`,
    `| Skipped edges | ${stats.skippedEdges} |`,
  ];

  if (stats.skipReasons.length > 0) {
    lines.push('');
    lines.push('**Skipped edge details:**');
    for (const reason of stats.skipReasons.slice(0, 20)) {
      lines.push(`- ${reason}`);
    }
    if (stats.skipReasons.length > 20) {
      lines.push(`- ... and ${stats.skipReasons.length - 20} more`);
    }
  }

  lines.push(
    '',
    `Mode: ${args.merge ? 'merge (added to existing)' : 'replace'}`,
    shouldLayout ? `Layout: ${args.layoutDirection ?? 'TB'}` : 'Layout: skipped',
  );

  return {
    content: [{ type: 'text' as const, text: lines.join('\n') }],
  };
}

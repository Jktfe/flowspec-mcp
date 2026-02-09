import { z } from 'zod';
import { parse as parseYaml } from 'yaml';
import { getProject, updateProjectViaApi } from '../db.js';
import { importFromYaml } from '../import/yamlImporter.js';
import { computeAutoLayout } from '../layout/autoLayout.js';
import type { CanvasNode, CanvasEdge } from '../types.js';

export const importYamlSchema = z.object({
  projectId: z.string().describe('UUID of the target project'),
  yaml: z.string().describe('YAML spec string (FlowSpec v1.2.0 format)'),
  autoLayout: z.boolean().optional().describe('Run dagre auto-layout after import (default: true)'),
  layoutDirection: z.enum(['TB', 'BT', 'LR', 'RL']).optional().describe('Layout direction (default: TB)'),
  merge: z.boolean().optional().describe('true = add to existing canvas, false = replace (default: false)'),
});

export async function handleImportYaml(args: z.infer<typeof importYamlSchema>) {
  // Parse YAML string
  let spec: Record<string, unknown>;
  try {
    spec = parseYaml(args.yaml) as Record<string, unknown>;
  } catch (e) {
    return {
      content: [{ type: 'text' as const, text: `YAML parse error: ${(e as Error).message}` }],
      isError: true,
    };
  }

  if (!spec || typeof spec !== 'object') {
    return {
      content: [{ type: 'text' as const, text: 'Invalid YAML: expected an object at the top level' }],
      isError: true,
    };
  }

  // Import YAML → nodes/edges/screens
  const result = importFromYaml(spec);

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
    `Imported YAML into project **${updated.name}**`,
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
    '',
    `Mode: ${args.merge ? 'merge (added to existing)' : 'replace'}`,
    shouldLayout ? `Layout: ${args.layoutDirection ?? 'TB'}` : 'Layout: skipped',
  ];

  return {
    content: [{ type: 'text' as const, text: lines.join('\n') }],
  };
}

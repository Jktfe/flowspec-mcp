import { z } from 'zod';
import { getProject } from '../db.js';

export const analyseProjectSchema = z.object({
  projectId: z.string().describe('UUID of the project to analyse'),
});

interface OrphanNode {
  id: string;
  label: string;
  nodeType: string;
  screenRefs: string[];
}

interface DuplicateGroup {
  label: string;
  nodeType: string;
  nodeIds: string[];
  nodeTypes: string[];
}

export async function handleAnalyseProject(args: z.infer<typeof analyseProjectSchema>) {
  const project = await getProject(args.projectId);

  if (!project) {
    return {
      content: [{ type: 'text' as const, text: `Project not found: ${args.projectId}` }],
      isError: true,
    };
  }

  const nodes = project.canvas_state?.nodes ?? [];
  const edges = project.canvas_state?.edges ?? [];
  const screens = (project.canvas_state?.screens ?? []) as Array<{
    name: string;
    regions: Array<{ elementIds: string[] }>;
  }>;

  // Filter to meaningful nodes (exclude image and screen)
  const analysableNodes = nodes.filter(
    (n) => n.type !== 'image' && n.type !== 'screen'
  );

  // Build set of connected node IDs
  const connectedIds = new Set<string>();
  for (const e of edges) {
    connectedIds.add(e.source);
    connectedIds.add(e.target);
  }

  // Build screen-reference map
  const screenRefMap = new Map<string, string[]>();
  for (const sc of screens) {
    for (const r of sc.regions) {
      for (const eid of r.elementIds) {
        const refs = screenRefMap.get(eid) ?? [];
        if (!refs.includes(sc.name)) refs.push(sc.name);
        screenRefMap.set(eid, refs);
      }
    }
  }

  // Orphans
  const orphans: OrphanNode[] = [];
  for (const n of analysableNodes) {
    if (!connectedIds.has(n.id)) {
      orphans.push({
        id: n.id,
        label: (n.data?.label as string) ?? 'Untitled',
        nodeType: n.type ?? 'unknown',
        screenRefs: screenRefMap.get(n.id) ?? [],
      });
    }
  }

  // Duplicates
  const labelGroups = new Map<string, { ids: string[]; types: string[] }>();
  for (const n of analysableNodes) {
    const label = ((n.data?.label as string) ?? '').trim().toLowerCase();
    if (!label) continue;
    const group = labelGroups.get(label) ?? { ids: [], types: [] };
    group.ids.push(n.id);
    group.types.push(n.type ?? 'unknown');
    labelGroups.set(label, group);
  }

  const duplicates: DuplicateGroup[] = [];
  for (const [label, group] of labelGroups) {
    if (group.ids.length < 2) continue;
    const uniqueTypes = [...new Set(group.types)];
    duplicates.push({
      label,
      nodeType: uniqueTypes.length === 1 ? uniqueTypes[0] : 'mixed',
      nodeIds: group.ids,
      nodeTypes: group.types,
    });
  }

  const result = {
    orphans,
    duplicates,
    totalNodes: analysableNodes.length,
    connectedNodes: connectedIds.size,
  };

  // Format output
  const lines: string[] = [];
  lines.push(`## Analysis for ${project.name}`);
  lines.push(`Total nodes: ${result.totalNodes} | Connected: ${result.connectedNodes} | Orphans: ${result.orphans.length} | Duplicate labels: ${result.duplicates.length}`);

  if (result.orphans.length > 0) {
    lines.push('');
    lines.push('### Orphan Nodes (no edges)');
    for (const o of result.orphans) {
      const screenInfo = o.screenRefs.length > 0 ? ` [screens: ${o.screenRefs.join(', ')}]` : '';
      lines.push(`- **${o.label}** (${o.nodeType}, id: ${o.id})${screenInfo}`);
    }
  }

  if (result.duplicates.length > 0) {
    lines.push('');
    lines.push('### Duplicate Labels');
    for (const d of result.duplicates) {
      lines.push(`- **${d.label}** (${d.nodeType}) — ${d.nodeIds.length} nodes: ${d.nodeIds.join(', ')}`);
    }
  }

  if (result.orphans.length === 0 && result.duplicates.length === 0) {
    lines.push('');
    lines.push('No issues found — all nodes are connected and labels are unique.');
  }

  return {
    content: [{ type: 'text' as const, text: lines.join('\n') }],
  };
}

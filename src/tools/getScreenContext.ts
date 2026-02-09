import { z } from 'zod';
import { getProject } from '../db.js';
import type { Screen, CanvasNode } from '../types.js';

export const getScreenContextSchema = z.object({
  projectId: z.string().describe('UUID of the FlowSpec project'),
  screenId: z.string().optional().describe('Specific screen ID (omit for all screens)'),
});

export async function handleGetScreenContext(args: z.infer<typeof getScreenContextSchema>) {
  const project = await getProject(args.projectId);

  if (!project) {
    return {
      content: [{ type: 'text' as const, text: `Project not found: ${args.projectId}` }],
      isError: true,
    };
  }

  const screens: Screen[] = project.canvas_state?.screens ?? [];

  if (screens.length === 0) {
    return {
      content: [{ type: 'text' as const, text: 'No screens defined in this project.' }],
    };
  }

  // Build node label lookup from canvas nodes
  const nodes: CanvasNode[] = project.canvas_state?.nodes ?? [];
  const nodeLabelMap = new Map<string, { label: string; type: string }>();
  for (const n of nodes) {
    if (n.type === 'image') continue;
    const label = (n.data as { label?: string }).label ?? 'Untitled';
    nodeLabelMap.set(n.id, { label, type: n.type ?? 'unknown' });
  }

  // Filter to specific screen if requested
  const targetScreens = args.screenId
    ? screens.filter((s) => s.id === args.screenId)
    : screens;

  if (args.screenId && targetScreens.length === 0) {
    return {
      content: [{ type: 'text' as const, text: `Screen not found: ${args.screenId}` }],
      isError: true,
    };
  }

  const result = targetScreens.map((sc) => ({
    id: sc.id,
    name: sc.name,
    imageFilename: sc.imageFilename ?? null,
    regionCount: sc.regions.length,
    elementCount: sc.regions.reduce((sum, r) => sum + r.elementIds.length, 0),
    regions: sc.regions.map((r) => ({
      id: r.id,
      label: r.label ?? null,
      position: r.position,
      size: r.size,
      elements: r.elementIds.map((eid) => {
        const info = nodeLabelMap.get(eid);
        return {
          nodeId: eid,
          nodeLabel: info?.label ?? 'Missing element',
          nodeType: info?.type ?? 'unknown',
        };
      }),
    })),
  }));

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
  };
}

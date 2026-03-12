import { z } from 'zod';
import { createNodeViaApi } from '../db.js';
import { normaliseNodeData } from '../normalise.js';

export const createNodeSchema = z.object({
  projectId: z.string().describe('UUID of the project'),
  type: z.enum(['datapoint', 'component', 'transform', 'table', 'actor']).describe('Node type'),
  position: z.object({
    x: z.number().describe('X position on canvas'),
    y: z.number().describe('Y position on canvas'),
  }).describe('Canvas position'),
  data: z.record(z.unknown()).describe('Node data object. Required fields by type:\n- datapoint: { label, dataType, source (captured|retrieved|inferred) }\n- component: { label, displays: string[], captures: string[] }\n- transform: { label, transformType, inputs: string[], outputs: string[], logic: string }\n- table: { label, columns: [{name, type}], sourceType (database|api|file|manual) }\n- actor: { label, actorType (user|ai|third-party|tbd) }'),
});

export async function handleCreateNode(args: z.infer<typeof createNodeSchema>) {
  const normalisedData = normaliseNodeData(args.type, args.data);

  const node = await createNodeViaApi(args.projectId, {
    type: args.type,
    position: args.position,
    data: normalisedData,
  });

  if (!node) {
    return {
      content: [{ type: 'text' as const, text: `Failed to create node — project not found: ${args.projectId}` }],
      isError: true,
    };
  }

  return {
    content: [{
      type: 'text' as const,
      text: `Created ${args.type} node **${args.data.label ?? node.id}** (id: ${node.id})`,
    }],
  };
}

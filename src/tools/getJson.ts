import { z } from 'zod';
import { getProject } from '../db.js';
import { exportToJson } from '../export/jsonExporter.js';

export const getJsonSchema = z.object({
  projectId: z.string().describe('UUID of the FlowSpec project'),
});

export async function handleGetJson(args: z.infer<typeof getJsonSchema>) {
  const project = await getProject(args.projectId);

  if (!project) {
    return {
      content: [{ type: 'text' as const, text: `Project not found: ${args.projectId}` }],
      isError: true,
    };
  }

  const nodes = project.canvas_state?.nodes ?? [];
  const edges = project.canvas_state?.edges ?? [];
  const screens = project.canvas_state?.screens ?? [];

  const json = exportToJson(nodes, edges, project.name, screens);

  return {
    content: [{ type: 'text' as const, text: json }],
  };
}

import { z } from 'zod';
import { getProject } from '../db.js';
import { exportToYaml } from '../export/yamlExporter.js';

export const getYamlSchema = z.object({
  projectId: z.string().describe('UUID of the FlowSpec project'),
});

export async function handleGetYaml(args: z.infer<typeof getYamlSchema>) {
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

  const yaml = exportToYaml(nodes, edges, project.name, screens);

  return {
    content: [{ type: 'text' as const, text: yaml }],
  };
}

import { z } from 'zod';
import { getProject } from '../db.js';

export const getProjectSchema = z.object({
  projectId: z.string().describe('UUID of the FlowSpec project'),
});

export async function handleGetProject(args: z.infer<typeof getProjectSchema>) {
  const project = await getProject(args.projectId);

  if (!project) {
    return {
      content: [{ type: 'text' as const, text: `Project not found: ${args.projectId}` }],
      isError: true,
    };
  }

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(project.canvas_state, null, 2) }],
  };
}

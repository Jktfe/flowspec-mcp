import { z } from 'zod';
import { createProjectViaApi } from '../db.js';

export const createProjectSchema = z.object({
  name: z.string().describe('Project name'),
  canvas_state: z.any().optional().describe('Initial canvas state JSON (nodes, edges, screens). Defaults to empty.'),
});

export async function handleCreateProject(args: z.infer<typeof createProjectSchema>) {
  const project = await createProjectViaApi(args.name, args.canvas_state);

  return {
    content: [{
      type: 'text' as const,
      text: `Created project **${project.name}** (id: ${project.id})`,
    }],
  };
}

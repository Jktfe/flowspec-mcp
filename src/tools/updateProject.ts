import { z } from 'zod';
import { updateProjectViaApi } from '../db.js';

export const updateProjectSchema = z.object({
  projectId: z.string().describe('UUID of the project to update'),
  name: z.string().optional().describe('New project name'),
  canvas_state: z.any().optional().describe('Full replacement canvas state JSON'),
});

export async function handleUpdateProject(args: z.infer<typeof updateProjectSchema>) {
  const updates: { name?: string; canvas_state?: unknown } = {};
  if (args.name) updates.name = args.name;
  if (args.canvas_state) updates.canvas_state = args.canvas_state;

  const project = await updateProjectViaApi(args.projectId, updates);

  if (!project) {
    return {
      content: [{ type: 'text' as const, text: `Project not found: ${args.projectId}` }],
      isError: true,
    };
  }

  return {
    content: [{ type: 'text' as const, text: `Updated project **${project.name}** (id: ${project.id})` }],
  };
}

import { z } from 'zod';
import { deleteProjectViaApi } from '../db.js';

export const deleteProjectSchema = z.object({
  projectId: z.string().describe('UUID of the project to delete'),
});

export async function handleDeleteProject(args: z.infer<typeof deleteProjectSchema>) {
  const ok = await deleteProjectViaApi(args.projectId);

  if (!ok) {
    return {
      content: [{ type: 'text' as const, text: `Project not found: ${args.projectId}` }],
      isError: true,
    };
  }

  return {
    content: [{ type: 'text' as const, text: `Deleted project ${args.projectId}` }],
  };
}

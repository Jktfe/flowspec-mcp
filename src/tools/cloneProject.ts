import { z } from 'zod';
import { cloneProjectViaApi } from '../db.js';

export const cloneProjectSchema = z.object({
  projectId: z.string().describe('UUID of the project to clone'),
});

export async function handleCloneProject(args: z.infer<typeof cloneProjectSchema>) {
  const clonedId = await cloneProjectViaApi(args.projectId);

  if (!clonedId) {
    return {
      content: [{ type: 'text' as const, text: `Failed to clone — source project not found: ${args.projectId}` }],
      isError: true,
    };
  }

  return {
    content: [{
      type: 'text' as const,
      text: `Cloned project (new id: ${clonedId})`,
    }],
  };
}

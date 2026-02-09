import { z } from 'zod';
import { listProjects } from '../db.js';

export const listProjectsSchema = z.object({});

export async function handleListProjects() {
  const projects = await listProjects();

  if (projects.length === 0) {
    return { content: [{ type: 'text' as const, text: 'No projects found.' }] };
  }

  const lines = projects.map(
    (p) => `- **${p.name}** (id: ${p.id}) — updated ${p.updated_at}`
  );

  return {
    content: [{ type: 'text' as const, text: `Found ${projects.length} project(s):\n\n${lines.join('\n')}` }],
  };
}

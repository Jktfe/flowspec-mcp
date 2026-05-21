import { z } from 'zod';
import { listProjects } from '../db.js';
import { MODE } from '../config.js';

export const listProjectsSchema = z.object({});

export async function handleListProjects() {
  const projects = await listProjects();

  if (projects.length === 0) {
    const hint = MODE === 'cloud'
      ? ' If you expected to see projects, your FLOWSPEC_USER_ID may be incorrect. ' +
        'Find your correct User ID at: https://flowspec.app/account (under "MCP Configuration").'
      : '';
    return { content: [{ type: 'text' as const, text: `No projects found.${hint}` }] };
  }

  const lines = projects.map(
    (p) => `- **${p.name}** (id: ${p.id}) — updated ${p.updated_at}`
  );

  return {
    content: [{ type: 'text' as const, text: `Found ${projects.length} project(s):\n\n${lines.join('\n')}` }],
  };
}

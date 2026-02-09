import { randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import type { Project, CanvasNode, CanvasEdge } from './types.js';
import { MODE, LOCAL_API_BASE, getLocalAuthToken } from './config.js';

// ─── Cloud mode (direct Neon SQL) ──────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NeonSql = (strings: TemplateStringsArray, ...values: any[]) => Promise<Record<string, unknown>[]>;

let sql: NeonSql | null = null;
let FLOWSPEC_USER_ID: string | null = null;

if (MODE === 'cloud') {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) throw new Error('DATABASE_URL environment variable is required in cloud mode');
  FLOWSPEC_USER_ID = process.env.FLOWSPEC_USER_ID ?? null;
  if (!FLOWSPEC_USER_ID) throw new Error(
    'FLOWSPEC_USER_ID environment variable is required in cloud mode.\n' +
    'Find your User ID at: https://flowspec.app/account (under "MCP Configuration").'
  );
  sql = neon(DATABASE_URL) as unknown as NeonSql;
}

// ─── Local mode (HTTP to desktop server) ───────────────────────────

async function fetchLocal(path: string, options?: RequestInit): Promise<Response> {
  const token = getLocalAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string> ?? {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  return fetch(`${LOCAL_API_BASE}${path}`, {
    ...options,
    headers,
  });
}

// ─── Exported query functions (work in both modes) ─────────────────

export async function listProjects(): Promise<Pick<Project, 'id' | 'name' | 'created_at' | 'updated_at'>[]> {
  if (MODE === 'local') {
    const res = await fetchLocal('/api/projects');
    return res.json();
  }

  const rows = await sql!`
    SELECT id, name, created_at, updated_at
    FROM projects
    WHERE user_id = ${FLOWSPEC_USER_ID!}
    ORDER BY updated_at DESC
  `;
  return rows as Pick<Project, 'id' | 'name' | 'created_at' | 'updated_at'>[];
}

export async function getProject(projectId: string): Promise<Project | null> {
  if (MODE === 'local') {
    const res = await fetchLocal(`/api/projects/${projectId}`);
    if (!res.ok) return null;
    return res.json();
  }

  const rows = await sql!`
    SELECT id, name, canvas_state, thumbnail_url, user_id, is_public, created_at, updated_at
    FROM projects
    WHERE id = ${projectId} AND user_id = ${FLOWSPEC_USER_ID!}
  `;
  return (rows[0] as unknown as Project) ?? null;
}

export async function searchNodes(
  query: string,
  nodeType?: string
): Promise<Array<{ projectId: string; projectName: string; nodeId: string; nodeType: string; label: string }>> {
  if (MODE === 'local') {
    // In local mode, fetch all projects and search client-side (same logic as cloud)
    const res = await fetchLocal('/api/projects');
    const summaries: Array<{ id: string; name: string }> = await res.json();
    const results: Array<{ projectId: string; projectName: string; nodeId: string; nodeType: string; label: string }> = [];
    const lowerQuery = query.toLowerCase();

    for (const summary of summaries) {
      const projRes = await fetchLocal(`/api/projects/${summary.id}`);
      if (!projRes.ok) continue;
      const project = await projRes.json() as Project;
      const nodes = project.canvas_state?.nodes ?? [];

      for (const node of nodes) {
        if (node.type === 'image') continue;
        if (nodeType && node.type !== nodeType) continue;
        const label = (node.data?.label as string) ?? '';
        if (label.toLowerCase().includes(lowerQuery)) {
          results.push({
            projectId: project.id,
            projectName: project.name,
            nodeId: node.id,
            nodeType: node.type,
            label,
          });
        }
      }
    }
    return results;
  }

  const rows = await sql!`
    SELECT id, name, canvas_state
    FROM projects
    WHERE user_id = ${FLOWSPEC_USER_ID!}
  `;

  const results: Array<{
    projectId: string;
    projectName: string;
    nodeId: string;
    nodeType: string;
    label: string;
  }> = [];

  const lowerQuery = query.toLowerCase();

  for (const row of rows) {
    const project = row as unknown as Project;
    const nodes = project.canvas_state?.nodes ?? [];

    for (const node of nodes) {
      if (node.type === 'image') continue;
      if (nodeType && node.type !== nodeType) continue;

      const label = (node.data?.label as string) ?? '';
      if (label.toLowerCase().includes(lowerQuery)) {
        results.push({
          projectId: project.id,
          projectName: project.name,
          nodeId: node.id,
          nodeType: node.type,
          label,
        });
      }
    }
  }

  return results;
}

// ─── Write operations (local mode only for now) ────────────────────

export async function createProjectViaApi(name: string, canvasState?: unknown): Promise<Project> {
  if (MODE === 'local') {
    const res = await fetchLocal('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name, canvas_state: canvasState ?? { nodes: [], edges: [] } }),
    });
    if (!res.ok) throw new Error(`Failed to create project: ${res.status}`);
    return res.json();
  }

  // Cloud mode: direct SQL insert
  const rows = await sql!`
    INSERT INTO projects (name, canvas_state, user_id)
    VALUES (${name}, ${JSON.stringify(canvasState ?? { nodes: [], edges: [] })}, ${FLOWSPEC_USER_ID!})
    RETURNING id, name, canvas_state, thumbnail_url, created_at, updated_at
  `;
  return rows[0] as unknown as Project;
}

export async function updateProjectViaApi(projectId: string, updates: { name?: string; canvas_state?: unknown }): Promise<Project | null> {
  if (MODE === 'local') {
    const res = await fetchLocal(`/api/projects/${projectId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    if (!res.ok) return null;
    return res.json();
  }

  const name = updates.name;
  const canvasState = updates.canvas_state;
  const rows = await sql!`
    UPDATE projects
    SET name = COALESCE(${name ?? null}, name),
        canvas_state = COALESCE(${canvasState ? JSON.stringify(canvasState) : null}::jsonb, canvas_state),
        updated_at = NOW()
    WHERE id = ${projectId} AND user_id = ${FLOWSPEC_USER_ID!}
    RETURNING id, name, canvas_state, thumbnail_url, created_at, updated_at
  `;
  return (rows[0] as unknown as Project) ?? null;
}

export async function deleteProjectViaApi(projectId: string): Promise<boolean> {
  if (MODE === 'local') {
    const res = await fetchLocal(`/api/projects/${projectId}`, { method: 'DELETE' });
    return res.ok;
  }

  const rows = await sql!`
    DELETE FROM projects
    WHERE id = ${projectId} AND user_id = ${FLOWSPEC_USER_ID!}
    RETURNING id
  `;
  return rows.length > 0;
}

export async function createNodeViaApi(
  projectId: string,
  node: { type: string; position: { x: number; y: number }; data: Record<string, unknown> }
): Promise<{ id: string; type: string; position: { x: number; y: number }; data: Record<string, unknown> } | null> {
  if (MODE === 'local') {
    const res = await fetchLocal(`/api/projects/${projectId}/nodes`, {
      method: 'POST',
      body: JSON.stringify(node),
    });
    if (!res.ok) return null;
    return res.json();
  }

  // Cloud mode: read-modify-write on canvas_state
  const project = await getProject(projectId);
  if (!project) return null;

  const nodeId = randomUUID();
  const newNode = { id: nodeId, ...node };
  project.canvas_state.nodes.push(newNode as CanvasNode);

  await sql!`
    UPDATE projects
    SET canvas_state = ${JSON.stringify(project.canvas_state)}::jsonb, updated_at = NOW()
    WHERE id = ${projectId} AND user_id = ${FLOWSPEC_USER_ID!}
  `;
  return newNode;
}

export async function updateNodeViaApi(
  projectId: string,
  nodeId: string,
  updates: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  if (MODE === 'local') {
    const res = await fetchLocal(`/api/projects/${projectId}/nodes/${nodeId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    if (!res.ok) return null;
    return res.json();
  }

  const project = await getProject(projectId);
  if (!project) return null;
  const idx = project.canvas_state.nodes.findIndex((n) => n.id === nodeId);
  if (idx === -1) return null;

  const existing = project.canvas_state.nodes[idx];
  const updated = { ...existing, ...updates, id: nodeId, data: { ...existing.data, ...(updates.data as Record<string, unknown> ?? {}) } };
  project.canvas_state.nodes[idx] = updated as CanvasNode;

  await sql!`
    UPDATE projects
    SET canvas_state = ${JSON.stringify(project.canvas_state)}::jsonb, updated_at = NOW()
    WHERE id = ${projectId} AND user_id = ${FLOWSPEC_USER_ID!}
  `;
  return updated;
}

export async function deleteNodeViaApi(projectId: string, nodeId: string): Promise<boolean> {
  if (MODE === 'local') {
    const res = await fetchLocal(`/api/projects/${projectId}/nodes/${nodeId}`, { method: 'DELETE' });
    return res.ok;
  }

  const project = await getProject(projectId);
  if (!project) return false;
  const idx = project.canvas_state.nodes.findIndex((n) => n.id === nodeId);
  if (idx === -1) return false;

  project.canvas_state.nodes.splice(idx, 1);
  project.canvas_state.edges = project.canvas_state.edges.filter(
    (e) => e.source !== nodeId && e.target !== nodeId
  );

  await sql!`
    UPDATE projects
    SET canvas_state = ${JSON.stringify(project.canvas_state)}::jsonb, updated_at = NOW()
    WHERE id = ${projectId} AND user_id = ${FLOWSPEC_USER_ID!}
  `;
  return true;
}

export async function createEdgeViaApi(
  projectId: string,
  edge: { source: string; target: string; type?: string; data?: Record<string, unknown> }
): Promise<{ id: string; source: string; target: string; type: string; data: Record<string, unknown> } | null> {
  if (MODE === 'local') {
    const res = await fetchLocal(`/api/projects/${projectId}/edges`, {
      method: 'POST',
      body: JSON.stringify(edge),
    });
    if (!res.ok) return null;
    return res.json();
  }

  const project = await getProject(projectId);
  if (!project) return null;

  const edgeId = randomUUID();
  const newEdge = { id: edgeId, source: edge.source, target: edge.target, type: edge.type ?? 'typed', data: edge.data ?? {} };
  project.canvas_state.edges.push(newEdge as CanvasEdge);

  await sql!`
    UPDATE projects
    SET canvas_state = ${JSON.stringify(project.canvas_state)}::jsonb, updated_at = NOW()
    WHERE id = ${projectId} AND user_id = ${FLOWSPEC_USER_ID!}
  `;
  return newEdge;
}

export async function deleteEdgeViaApi(projectId: string, edgeId: string): Promise<boolean> {
  if (MODE === 'local') {
    const res = await fetchLocal(`/api/projects/${projectId}/edges/${edgeId}`, { method: 'DELETE' });
    return res.ok;
  }

  const project = await getProject(projectId);
  if (!project) return false;
  const idx = project.canvas_state.edges.findIndex((e) => e.id === edgeId);
  if (idx === -1) return false;

  project.canvas_state.edges.splice(idx, 1);

  await sql!`
    UPDATE projects
    SET canvas_state = ${JSON.stringify(project.canvas_state)}::jsonb, updated_at = NOW()
    WHERE id = ${projectId} AND user_id = ${FLOWSPEC_USER_ID!}
  `;
  return true;
}

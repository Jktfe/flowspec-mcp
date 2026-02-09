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

// ─── v3.0 API functions ────────────────────────────────────────────

export async function cloneProjectViaApi(projectId: string): Promise<string | null> {
  if (MODE === 'local') {
    const res = await fetchLocal(`/api/projects/${projectId}/clone`, { method: 'POST' });
    if (!res.ok) return null;
    const data = await res.json();
    return data.id;
  }

  const project = await getProject(projectId);
  if (!project) return null;

  const rows = await sql!`
    INSERT INTO projects (name, canvas_state, user_id)
    VALUES (${project.name + ' (Copy)'}, ${JSON.stringify(project.canvas_state)}, ${FLOWSPEC_USER_ID!})
    RETURNING id
  `;
  return (rows[0] as { id: string }).id;
}

export async function uploadImageViaApi(
  base64Data: string,
  filename: string,
  contentType: string
): Promise<{ url: string; width: number; height: number } | null> {
  if (MODE !== 'local') {
    throw new Error('Image upload is only supported in local mode');
  }

  const res = await fetchLocal('/api/images', {
    method: 'POST',
    body: JSON.stringify({ base64Data, filename, contentType }),
  });
  if (!res.ok) return null;
  return res.json();
}

export async function createScreenViaApi(
  projectId: string,
  name: string,
  imageUrl?: string,
  imageWidth?: number,
  imageHeight?: number,
  imageFilename?: string
): Promise<{ id: string; name: string } | null> {
  if (MODE === 'local') {
    const res = await fetchLocal(`/api/projects/${projectId}/screens`, {
      method: 'POST',
      body: JSON.stringify({ name, imageUrl, imageWidth, imageHeight, imageFilename }),
    });
    if (!res.ok) return null;
    return res.json();
  }

  const project = await getProject(projectId);
  if (!project) return null;

  const screenId = randomUUID();
  const newScreen = {
    id: screenId,
    name,
    imageUrl: imageUrl ?? null,
    imageWidth: imageWidth ?? null,
    imageHeight: imageHeight ?? null,
    imageFilename: imageFilename ?? null,
    regions: [],
  };

  if (!project.canvas_state.screens) {
    project.canvas_state.screens = [];
  }
  project.canvas_state.screens.push(newScreen);

  await sql!`
    UPDATE projects
    SET canvas_state = ${JSON.stringify(project.canvas_state)}::jsonb, updated_at = NOW()
    WHERE id = ${projectId} AND user_id = ${FLOWSPEC_USER_ID!}
  `;
  return { id: screenId, name };
}

export async function updateScreenViaApi(
  projectId: string,
  screenId: string,
  updates: Partial<{ name: string; imageUrl: string; imageWidth: number; imageHeight: number }>
): Promise<{ id: string; name: string } | null> {
  if (MODE === 'local') {
    const res = await fetchLocal(`/api/projects/${projectId}/screens/${screenId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    if (!res.ok) return null;
    return res.json();
  }

  const project = await getProject(projectId);
  if (!project || !project.canvas_state.screens) return null;
  const screen = project.canvas_state.screens.find((s: any) => s.id === screenId);
  if (!screen) return null;

  Object.assign(screen, updates);

  await sql!`
    UPDATE projects
    SET canvas_state = ${JSON.stringify(project.canvas_state)}::jsonb, updated_at = NOW()
    WHERE id = ${projectId} AND user_id = ${FLOWSPEC_USER_ID!}
  `;
  return { id: screenId, name: screen.name };
}

export async function deleteScreenViaApi(
  projectId: string,
  screenId: string
): Promise<boolean> {
  if (MODE === 'local') {
    const res = await fetchLocal(`/api/projects/${projectId}/screens/${screenId}`, { method: 'DELETE' });
    return res.ok;
  }

  const project = await getProject(projectId);
  if (!project || !project.canvas_state.screens) return false;
  const idx = project.canvas_state.screens.findIndex((s: any) => s.id === screenId);
  if (idx === -1) return false;

  project.canvas_state.screens.splice(idx, 1);

  await sql!`
    UPDATE projects
    SET canvas_state = ${JSON.stringify(project.canvas_state)}::jsonb, updated_at = NOW()
    WHERE id = ${projectId} AND user_id = ${FLOWSPEC_USER_ID!}
  `;
  return true;
}

export async function addRegionViaApi(
  projectId: string,
  screenId: string,
  region: {
    label?: string;
    position: { x: number; y: number };
    size: { width: number; height: number };
    elementIds?: string[];
    componentNodeId?: string;
  }
): Promise<{ id: string; label?: string } | null> {
  if (MODE === 'local') {
    const res = await fetchLocal(`/api/projects/${projectId}/screens/${screenId}/regions`, {
      method: 'POST',
      body: JSON.stringify(region),
    });
    if (!res.ok) return null;
    return res.json();
  }

  const project = await getProject(projectId);
  if (!project || !project.canvas_state.screens) return null;
  const screen = project.canvas_state.screens.find((s: any) => s.id === screenId);
  if (!screen) return null;

  const regionId = randomUUID();
  const newRegion = {
    id: regionId,
    label: region.label ?? null,
    position: region.position,
    size: region.size,
    elementIds: region.elementIds ?? [],
    componentNodeId: region.componentNodeId ?? null,
  };

  if (!screen.regions) screen.regions = [];
  screen.regions.push(newRegion);

  await sql!`
    UPDATE projects
    SET canvas_state = ${JSON.stringify(project.canvas_state)}::jsonb, updated_at = NOW()
    WHERE id = ${projectId} AND user_id = ${FLOWSPEC_USER_ID!}
  `;
  return { id: regionId, label: region.label };
}

export async function updateRegionViaApi(
  projectId: string,
  screenId: string,
  regionId: string,
  updates: Partial<{
    label: string;
    position: { x: number; y: number };
    size: { width: number; height: number };
    elementIds: string[];
  }>
): Promise<{ id: string } | null> {
  if (MODE === 'local') {
    const res = await fetchLocal(`/api/projects/${projectId}/screens/${screenId}/regions/${regionId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    if (!res.ok) return null;
    return res.json();
  }

  const project = await getProject(projectId);
  if (!project || !project.canvas_state.screens) return null;
  const screen = project.canvas_state.screens.find((s: any) => s.id === screenId);
  if (!screen || !screen.regions) return null;
  const region = screen.regions.find((r: any) => r.id === regionId);
  if (!region) return null;

  Object.assign(region, updates);

  await sql!`
    UPDATE projects
    SET canvas_state = ${JSON.stringify(project.canvas_state)}::jsonb, updated_at = NOW()
    WHERE id = ${projectId} AND user_id = ${FLOWSPEC_USER_ID!}
  `;
  return { id: regionId };
}

export async function removeRegionViaApi(
  projectId: string,
  screenId: string,
  regionId: string
): Promise<boolean> {
  if (MODE === 'local') {
    const res = await fetchLocal(`/api/projects/${projectId}/screens/${screenId}/regions/${regionId}`, { method: 'DELETE' });
    return res.ok;
  }

  const project = await getProject(projectId);
  if (!project || !project.canvas_state.screens) return false;
  const screen = project.canvas_state.screens.find((s: any) => s.id === screenId);
  if (!screen || !screen.regions) return false;
  const idx = screen.regions.findIndex((r: any) => r.id === regionId);
  if (idx === -1) return false;

  screen.regions.splice(idx, 1);

  await sql!`
    UPDATE projects
    SET canvas_state = ${JSON.stringify(project.canvas_state)}::jsonb, updated_at = NOW()
    WHERE id = ${projectId} AND user_id = ${FLOWSPEC_USER_ID!}
  `;
  return true;
}

export async function updateEdgeViaApi(
  projectId: string,
  edgeId: string,
  updates: Partial<{
    type: string;
    label: string;
    sourceHandle: string | null;
    targetHandle: string | null;
  }>
): Promise<{ id: string } | null> {
  if (MODE === 'local') {
    const res = await fetchLocal(`/api/projects/${projectId}/edges/${edgeId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    if (!res.ok) return null;
    return res.json();
  }

  const project = await getProject(projectId);
  if (!project) return null;
  const edge = project.canvas_state.edges.find((e) => e.id === edgeId);
  if (!edge) return null;

  Object.assign(edge, updates);
  if (updates.label !== undefined) {
    if (!edge.data) edge.data = {};
    edge.data.label = updates.label;
  }

  await sql!`
    UPDATE projects
    SET canvas_state = ${JSON.stringify(project.canvas_state)}::jsonb, updated_at = NOW()
    WHERE id = ${projectId} AND user_id = ${FLOWSPEC_USER_ID!}
  `;
  return { id: edgeId };
}

export async function bulkImportCanvasState(
  projectId: string,
  canvasState: { nodes: any[]; edges: any[]; screens?: any[] },
  merge: boolean
): Promise<{ nodeCount: number; edgeCount: number; screenCount: number }> {
  if (MODE === 'local') {
    const res = await fetchLocal(`/api/projects/${projectId}/import`, {
      method: 'POST',
      body: JSON.stringify({ canvasState, merge }),
    });
    if (!res.ok) throw new Error(`Failed to import: ${res.status}`);
    return res.json();
  }

  const project = await getProject(projectId);
  if (!project) throw new Error('Project not found');

  if (merge) {
    // Merge mode: add new nodes/edges/screens
    project.canvas_state.nodes.push(...canvasState.nodes);
    project.canvas_state.edges.push(...canvasState.edges);
    if (canvasState.screens) {
      if (!project.canvas_state.screens) project.canvas_state.screens = [];
      project.canvas_state.screens.push(...canvasState.screens);
    }
  } else {
    // Replace mode: replace entire canvas state
    project.canvas_state = canvasState as any;
  }

  await sql!`
    UPDATE projects
    SET canvas_state = ${JSON.stringify(project.canvas_state)}::jsonb, updated_at = NOW()
    WHERE id = ${projectId} AND user_id = ${FLOWSPEC_USER_ID!}
  `;

  return {
    nodeCount: canvasState.nodes.length,
    edgeCount: canvasState.edges.length,
    screenCount: canvasState.screens?.length ?? 0,
  };
}

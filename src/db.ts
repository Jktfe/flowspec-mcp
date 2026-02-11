import { randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import type { Project, CanvasNode, CanvasEdge, Screen, ScreenRegion } from './types.js';
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

// ─── DB row types (normalized schema v4) ────────────────────────────

interface NodeRow {
  id: string;
  project_id: string;
  type: string;
  position_x: number;
  position_y: number;
  label: string | null;
  data: Record<string, unknown>;
}

interface EdgeRow {
  id: string;
  project_id: string;
  source: string;
  target: string;
  type: string;
  data: Record<string, unknown>;
}

interface ScreenRow {
  id: string;
  project_id: string;
  name: string;
  image_url: string;
  local_image_path: string | null;
  image_filename: string | null;
  image_width: number;
  image_height: number;
}

interface RegionRow {
  id: string;
  screen_id: string;
  project_id: string;
  label: string | null;
  position_x: number;
  position_y: number;
  size_width: number;
  size_height: number;
  component_node_id: string | null;
}

interface RegionElementRow {
  region_id: string;
  node_id: string;
  position_order: number;
}

// ─── Helper: reconstruct canvas_state from normalized rows ──────────

function buildCanvasState(
  nodes: NodeRow[],
  edges: EdgeRow[],
  screens: ScreenRow[],
  regions: RegionRow[],
  regionElements: RegionElementRow[]
): Project['canvas_state'] {
  const canvasNodes: CanvasNode[] = nodes.map(n => ({
    id: n.id,
    type: n.type,
    position: { x: n.position_x, y: n.position_y },
    data: { ...n.data, label: n.label ?? n.data.label }
  }));

  const canvasEdges: CanvasEdge[] = edges.map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: e.type,
    data: e.data
  }));

  const canvasScreens: Screen[] = screens.map(s => {
    const screenRegions: ScreenRegion[] = regions
      .filter(r => r.screen_id === s.id)
      .map(r => {
        const elementIds = regionElements
          .filter(re => re.region_id === r.id)
          .sort((a, b) => a.position_order - b.position_order)
          .map(re => re.node_id);

        return {
          id: r.id,
          label: r.label ?? undefined,
          position: { x: r.position_x, y: r.position_y },
          size: { width: r.size_width, height: r.size_height },
          elementIds,
          componentNodeId: r.component_node_id ?? undefined
        };
      });

    return {
      id: s.id,
      name: s.name,
      imageUrl: s.image_url,
      imageWidth: s.image_width,
      imageHeight: s.image_height,
      imageFilename: s.image_filename ?? undefined,
      regions: screenRegions
    };
  });

  return {
    nodes: canvasNodes,
    edges: canvasEdges,
    screens: canvasScreens.length > 0 ? canvasScreens : undefined
  };
}

// ─── Helper: fetch full project from normalized tables (cloud) ──────

async function getProjectFromNormalized(projectId: string): Promise<Project | null> {
  const projectRows = await sql!`
    SELECT id, name, thumbnail_url, user_id, is_public, created_at, updated_at
    FROM projects
    WHERE id = ${projectId} AND user_id = ${FLOWSPEC_USER_ID!}
  `;
  if (projectRows.length === 0) return null;
  const meta = projectRows[0];

  const [nodesRaw, edgesRaw, screensRaw, regionsRaw, regionElementsRaw] = await Promise.all([
    sql!`SELECT id, project_id, type, position_x, position_y, label, data FROM nodes WHERE project_id = ${projectId}`,
    sql!`SELECT id, project_id, source, target, type, data FROM edges WHERE project_id = ${projectId}`,
    sql!`SELECT id, project_id, name, image_url, local_image_path, image_filename, image_width, image_height FROM screens WHERE project_id = ${projectId}`,
    sql!`SELECT id, screen_id, project_id, label, position_x, position_y, size_width, size_height, component_node_id FROM screen_regions WHERE project_id = ${projectId}`,
    sql!`
      SELECT re.region_id, re.node_id, re.position_order
      FROM region_elements re
      INNER JOIN screen_regions sr ON re.region_id = sr.id
      WHERE sr.project_id = ${projectId}
      ORDER BY re.region_id, re.position_order
    `
  ]);

  const canvas_state = buildCanvasState(
    nodesRaw as unknown as NodeRow[],
    edgesRaw as unknown as EdgeRow[],
    screensRaw as unknown as ScreenRow[],
    regionsRaw as unknown as RegionRow[],
    regionElementsRaw as unknown as RegionElementRow[]
  );

  return {
    id: meta.id as string,
    name: meta.name as string,
    canvas_state,
    thumbnail_url: (meta.thumbnail_url as string) ?? null,
    user_id: meta.user_id as string,
    is_public: meta.is_public as boolean,
    created_at: meta.created_at as string,
    updated_at: meta.updated_at as string
  };
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

  return getProjectFromNormalized(projectId);
}

export async function searchNodes(
  query: string,
  nodeType?: string
): Promise<Array<{ projectId: string; projectName: string; nodeId: string; nodeType: string; label: string }>> {
  if (MODE === 'local') {
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

  // Cloud mode: indexed query on normalized nodes table
  const typeFilter = nodeType ? nodeType : null;
  const rows = await sql!`
    SELECT n.id AS node_id, n.type AS node_type, n.label,
           p.id AS project_id, p.name AS project_name
    FROM nodes n
    INNER JOIN projects p ON n.project_id = p.id
    WHERE p.user_id = ${FLOWSPEC_USER_ID!}
      AND n.type != 'image'
      AND n.label ILIKE ${'%' + query + '%'}
      AND (${typeFilter}::text IS NULL OR n.type = ${typeFilter})
  `;

  return rows.map(row => ({
    projectId: row.project_id as string,
    projectName: row.project_name as string,
    nodeId: row.node_id as string,
    nodeType: row.node_type as string,
    label: row.label as string
  }));
}

// ─── Write operations ───────────────────────────────────────────────

export async function createProjectViaApi(name: string, canvasState?: unknown): Promise<Project> {
  if (MODE === 'local') {
    const res = await fetchLocal('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name, canvas_state: canvasState ?? { nodes: [], edges: [] } }),
    });
    if (!res.ok) throw new Error(`Failed to create project: ${res.status}`);
    return res.json();
  }

  // Cloud mode: insert project metadata, then decompose canvas_state into normalized tables
  const projectId = randomUUID();
  await sql!`
    INSERT INTO projects (id, name, user_id, created_at, updated_at)
    VALUES (${projectId}, ${name}, ${FLOWSPEC_USER_ID!}, NOW(), NOW())
  `;

  // If canvas_state provided, decompose into normalized tables
  const cs = (canvasState ?? { nodes: [], edges: [] }) as { nodes?: any[]; edges?: any[]; screens?: any[] };
  if (cs.nodes && cs.nodes.length > 0) {
    for (const node of cs.nodes) {
      const nodeId = node.id ?? randomUUID();
      await sql!`
        INSERT INTO nodes (id, project_id, type, position_x, position_y, label, data, created_at, updated_at)
        VALUES (${nodeId}, ${projectId}, ${node.type ?? 'datapoint'}, ${node.position?.x ?? 0}, ${node.position?.y ?? 0},
                ${node.data?.label ?? null}, ${JSON.stringify(node.data ?? {})}::jsonb, NOW(), NOW())
      `;
    }
  }
  if (cs.edges && cs.edges.length > 0) {
    for (const edge of cs.edges) {
      const edgeId = edge.id ?? randomUUID();
      await sql!`
        INSERT INTO edges (id, project_id, source, target, type, data, created_at, updated_at)
        VALUES (${edgeId}, ${projectId}, ${edge.source}, ${edge.target},
                ${edge.data?.edgeType ?? edge.type ?? 'flows-to'}, ${JSON.stringify(edge.data ?? {})}::jsonb, NOW(), NOW())
      `;
    }
  }

  const project = await getProjectFromNormalized(projectId);
  return project!;
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

  // Cloud mode: update name if provided
  if (updates.name) {
    await sql!`
      UPDATE projects SET name = ${updates.name}, updated_at = NOW()
      WHERE id = ${projectId} AND user_id = ${FLOWSPEC_USER_ID!}
    `;
  }

  // If canvas_state provided, replace all entities
  if (updates.canvas_state) {
    const cs = updates.canvas_state as { nodes?: any[]; edges?: any[]; screens?: any[] };

    // Delete existing entities (cascade handles region_elements)
    await sql!`DELETE FROM nodes WHERE project_id = ${projectId}`;
    await sql!`DELETE FROM edges WHERE project_id = ${projectId}`;
    await sql!`DELETE FROM screens WHERE project_id = ${projectId}`;

    // Re-insert nodes
    if (cs.nodes) {
      for (const node of cs.nodes) {
        const nodeId = node.id ?? randomUUID();
        await sql!`
          INSERT INTO nodes (id, project_id, type, position_x, position_y, label, data, created_at, updated_at)
          VALUES (${nodeId}, ${projectId}, ${node.type ?? 'datapoint'}, ${node.position?.x ?? 0}, ${node.position?.y ?? 0},
                  ${node.data?.label ?? null}, ${JSON.stringify(node.data ?? {})}::jsonb, NOW(), NOW())
        `;
      }
    }

    // Re-insert edges
    if (cs.edges) {
      for (const edge of cs.edges) {
        const edgeId = edge.id ?? randomUUID();
        await sql!`
          INSERT INTO edges (id, project_id, source, target, type, data, created_at, updated_at)
          VALUES (${edgeId}, ${projectId}, ${edge.source}, ${edge.target},
                  ${edge.data?.edgeType ?? edge.type ?? 'flows-to'}, ${JSON.stringify(edge.data ?? {})}::jsonb, NOW(), NOW())
        `;
      }
    }

    // Re-insert screens + regions + region_elements
    if (cs.screens) {
      for (const screen of cs.screens) {
        const screenId = screen.id ?? randomUUID();
        await sql!`
          INSERT INTO screens (id, project_id, name, image_url, image_filename, image_width, image_height, created_at, updated_at)
          VALUES (${screenId}, ${projectId}, ${screen.name}, ${screen.imageUrl ?? ''}, ${screen.imageFilename ?? null},
                  ${screen.imageWidth ?? 0}, ${screen.imageHeight ?? 0}, NOW(), NOW())
        `;
        if (screen.regions) {
          for (const region of screen.regions) {
            const regionId = region.id ?? randomUUID();
            await sql!`
              INSERT INTO screen_regions (id, screen_id, project_id, label, position_x, position_y, size_width, size_height, component_node_id, created_at, updated_at)
              VALUES (${regionId}, ${screenId}, ${projectId}, ${region.label ?? null},
                      ${region.position?.x ?? 0}, ${region.position?.y ?? 0},
                      ${region.size?.width ?? 0}, ${region.size?.height ?? 0},
                      ${region.componentNodeId ?? null}, NOW(), NOW())
            `;
            if (region.elementIds) {
              for (let i = 0; i < region.elementIds.length; i++) {
                await sql!`
                  INSERT INTO region_elements (region_id, node_id, position_order, created_at)
                  VALUES (${regionId}, ${region.elementIds[i]}, ${i}, NOW())
                `;
              }
            }
          }
        }
      }
    }
  }

  return getProjectFromNormalized(projectId);
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

  // Verify project ownership
  const check = await sql!`SELECT id FROM projects WHERE id = ${projectId} AND user_id = ${FLOWSPEC_USER_ID!}`;
  if (check.length === 0) return null;

  const nodeId = randomUUID();
  const label = (node.data.label as string) ?? null;
  await sql!`
    INSERT INTO nodes (id, project_id, type, position_x, position_y, label, data, created_at, updated_at)
    VALUES (${nodeId}, ${projectId}, ${node.type}, ${node.position.x}, ${node.position.y},
            ${label}, ${JSON.stringify(node.data)}::jsonb, NOW(), NOW())
  `;

  return { id: nodeId, type: node.type, position: node.position, data: node.data };
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

  // Fetch current node
  const nodeRows = await sql!`
    SELECT id, type, position_x, position_y, label, data
    FROM nodes WHERE id = ${nodeId} AND project_id = ${projectId}
  `;
  if (nodeRows.length === 0) return null;

  const existing = nodeRows[0];
  const existingData = existing.data as Record<string, unknown>;
  const updatedData = updates.data
    ? { ...existingData, ...(updates.data as Record<string, unknown>) }
    : existingData;

  const position = updates.position as { x: number; y: number } | undefined;
  const label = updatedData.label as string ?? existing.label;

  await sql!`
    UPDATE nodes
    SET position_x = COALESCE(${position?.x ?? null}, position_x),
        position_y = COALESCE(${position?.y ?? null}, position_y),
        label = ${label},
        data = ${JSON.stringify(updatedData)}::jsonb,
        updated_at = NOW()
    WHERE id = ${nodeId} AND project_id = ${projectId}
  `;

  return {
    id: nodeId,
    type: updates.type ?? existing.type,
    position: position ?? { x: existing.position_x as number, y: existing.position_y as number },
    data: updatedData
  };
}

export async function deleteNodeViaApi(projectId: string, nodeId: string): Promise<boolean> {
  if (MODE === 'local') {
    const res = await fetchLocal(`/api/projects/${projectId}/nodes/${nodeId}`, { method: 'DELETE' });
    return res.ok;
  }

  // Edges cascade-delete via FK, so just delete the node
  const rows = await sql!`
    DELETE FROM nodes WHERE id = ${nodeId} AND project_id = ${projectId}
    RETURNING id
  `;
  return rows.length > 0;
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

  // Verify project ownership
  const check = await sql!`SELECT id FROM projects WHERE id = ${projectId} AND user_id = ${FLOWSPEC_USER_ID!}`;
  if (check.length === 0) return null;

  const edgeId = randomUUID();
  const edgeType = edge.data?.edgeType as string ?? edge.type ?? 'flows-to';
  const data = edge.data ?? {};

  await sql!`
    INSERT INTO edges (id, project_id, source, target, type, data, created_at, updated_at)
    VALUES (${edgeId}, ${projectId}, ${edge.source}, ${edge.target}, ${edgeType}, ${JSON.stringify(data)}::jsonb, NOW(), NOW())
  `;

  return { id: edgeId, source: edge.source, target: edge.target, type: edgeType, data };
}

export async function deleteEdgeViaApi(projectId: string, edgeId: string): Promise<boolean> {
  if (MODE === 'local') {
    const res = await fetchLocal(`/api/projects/${projectId}/edges/${edgeId}`, { method: 'DELETE' });
    return res.ok;
  }

  const rows = await sql!`
    DELETE FROM edges WHERE id = ${edgeId} AND project_id = ${projectId}
    RETURNING id
  `;
  return rows.length > 0;
}

// ─── v3.0 API functions ────────────────────────────────────────────

export async function cloneProjectViaApi(projectId: string): Promise<string | null> {
  if (MODE === 'local') {
    const res = await fetchLocal(`/api/projects/${projectId}/clone`, { method: 'POST' });
    if (!res.ok) return null;
    const data = await res.json();
    return data.id;
  }

  const project = await getProjectFromNormalized(projectId);
  if (!project) return null;

  // Create new project with cloned canvas_state
  const newProject = await createProjectViaApi(
    project.name + ' (Copy)',
    project.canvas_state
  );
  return newProject.id;
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

  // Verify project ownership
  const check = await sql!`SELECT id FROM projects WHERE id = ${projectId} AND user_id = ${FLOWSPEC_USER_ID!}`;
  if (check.length === 0) return null;

  const screenId = randomUUID();
  await sql!`
    INSERT INTO screens (id, project_id, name, image_url, image_filename, image_width, image_height, created_at, updated_at)
    VALUES (${screenId}, ${projectId}, ${name}, ${imageUrl ?? ''}, ${imageFilename ?? null},
            ${imageWidth ?? 0}, ${imageHeight ?? 0}, NOW(), NOW())
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

  // Verify screen exists in project
  const screenRows = await sql!`
    SELECT id, name FROM screens WHERE id = ${screenId} AND project_id = ${projectId}
  `;
  if (screenRows.length === 0) return null;

  await sql!`
    UPDATE screens
    SET name = COALESCE(${updates.name ?? null}, name),
        image_url = COALESCE(${updates.imageUrl ?? null}, image_url),
        image_width = COALESCE(${updates.imageWidth ?? null}, image_width),
        image_height = COALESCE(${updates.imageHeight ?? null}, image_height),
        updated_at = NOW()
    WHERE id = ${screenId} AND project_id = ${projectId}
  `;

  const updatedName = updates.name ?? screenRows[0].name as string;
  return { id: screenId, name: updatedName };
}

export async function deleteScreenViaApi(
  projectId: string,
  screenId: string
): Promise<boolean> {
  if (MODE === 'local') {
    const res = await fetchLocal(`/api/projects/${projectId}/screens/${screenId}`, { method: 'DELETE' });
    return res.ok;
  }

  // Cascade deletes regions and region_elements via FK
  const rows = await sql!`
    DELETE FROM screens WHERE id = ${screenId} AND project_id = ${projectId}
    RETURNING id
  `;
  return rows.length > 0;
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

  // Verify screen exists
  const screenCheck = await sql!`
    SELECT id FROM screens WHERE id = ${screenId} AND project_id = ${projectId}
  `;
  if (screenCheck.length === 0) return null;

  const regionId = randomUUID();
  await sql!`
    INSERT INTO screen_regions (id, screen_id, project_id, label, position_x, position_y, size_width, size_height, component_node_id, created_at, updated_at)
    VALUES (${regionId}, ${screenId}, ${projectId}, ${region.label ?? null},
            ${region.position.x}, ${region.position.y},
            ${region.size.width}, ${region.size.height},
            ${region.componentNodeId ?? null}, NOW(), NOW())
  `;

  // Insert element references
  if (region.elementIds && region.elementIds.length > 0) {
    for (let i = 0; i < region.elementIds.length; i++) {
      await sql!`
        INSERT INTO region_elements (region_id, node_id, position_order, created_at)
        VALUES (${regionId}, ${region.elementIds[i]}, ${i}, NOW())
      `;
    }
  }

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

  // Verify region exists
  const regionCheck = await sql!`
    SELECT id FROM screen_regions WHERE id = ${regionId} AND screen_id = ${screenId} AND project_id = ${projectId}
  `;
  if (regionCheck.length === 0) return null;

  // Update region fields
  await sql!`
    UPDATE screen_regions
    SET label = COALESCE(${updates.label ?? null}, label),
        position_x = COALESCE(${updates.position?.x ?? null}, position_x),
        position_y = COALESCE(${updates.position?.y ?? null}, position_y),
        size_width = COALESCE(${updates.size?.width ?? null}, size_width),
        size_height = COALESCE(${updates.size?.height ?? null}, size_height),
        updated_at = NOW()
    WHERE id = ${regionId}
  `;

  // Replace element IDs if provided
  if (updates.elementIds !== undefined) {
    await sql!`DELETE FROM region_elements WHERE region_id = ${regionId}`;
    for (let i = 0; i < updates.elementIds.length; i++) {
      await sql!`
        INSERT INTO region_elements (region_id, node_id, position_order, created_at)
        VALUES (${regionId}, ${updates.elementIds[i]}, ${i}, NOW())
      `;
    }
  }

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

  // Cascade deletes region_elements via FK
  const rows = await sql!`
    DELETE FROM screen_regions WHERE id = ${regionId} AND screen_id = ${screenId} AND project_id = ${projectId}
    RETURNING id
  `;
  return rows.length > 0;
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

  // Verify edge exists
  const edgeRows = await sql!`
    SELECT id, data FROM edges WHERE id = ${edgeId} AND project_id = ${projectId}
  `;
  if (edgeRows.length === 0) return null;

  const existingData = (edgeRows[0].data ?? {}) as Record<string, unknown>;
  const newData = { ...existingData };
  if (updates.label !== undefined) newData.label = updates.label;

  await sql!`
    UPDATE edges
    SET type = COALESCE(${updates.type ?? null}, type),
        data = ${JSON.stringify(newData)}::jsonb,
        updated_at = NOW()
    WHERE id = ${edgeId} AND project_id = ${projectId}
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

  // Verify project ownership
  const check = await sql!`SELECT id FROM projects WHERE id = ${projectId} AND user_id = ${FLOWSPEC_USER_ID!}`;
  if (check.length === 0) throw new Error('Project not found');

  if (!merge) {
    // Replace mode: clear existing entities first
    await sql!`DELETE FROM nodes WHERE project_id = ${projectId}`;
    await sql!`DELETE FROM edges WHERE project_id = ${projectId}`;
    await sql!`DELETE FROM screens WHERE project_id = ${projectId}`;
  }

  // Insert nodes
  for (const node of canvasState.nodes) {
    const nodeId = node.id ?? randomUUID();
    await sql!`
      INSERT INTO nodes (id, project_id, type, position_x, position_y, label, data, created_at, updated_at)
      VALUES (${nodeId}, ${projectId}, ${node.type ?? 'datapoint'}, ${node.position?.x ?? 0}, ${node.position?.y ?? 0},
              ${node.data?.label ?? null}, ${JSON.stringify(node.data ?? {})}::jsonb, NOW(), NOW())
    `;
  }

  // Insert edges
  for (const edge of canvasState.edges) {
    const edgeId = edge.id ?? randomUUID();
    await sql!`
      INSERT INTO edges (id, project_id, source, target, type, data, created_at, updated_at)
      VALUES (${edgeId}, ${projectId}, ${edge.source}, ${edge.target},
              ${edge.data?.edgeType ?? edge.type ?? 'flows-to'}, ${JSON.stringify(edge.data ?? {})}::jsonb, NOW(), NOW())
    `;
  }

  // Insert screens + regions
  if (canvasState.screens) {
    for (const screen of canvasState.screens) {
      const screenId = screen.id ?? randomUUID();
      await sql!`
        INSERT INTO screens (id, project_id, name, image_url, image_filename, image_width, image_height, created_at, updated_at)
        VALUES (${screenId}, ${projectId}, ${screen.name}, ${screen.imageUrl ?? ''}, ${screen.imageFilename ?? null},
                ${screen.imageWidth ?? 0}, ${screen.imageHeight ?? 0}, NOW(), NOW())
      `;
      if (screen.regions) {
        for (const region of screen.regions) {
          const regionId = region.id ?? randomUUID();
          await sql!`
            INSERT INTO screen_regions (id, screen_id, project_id, label, position_x, position_y, size_width, size_height, component_node_id, created_at, updated_at)
            VALUES (${regionId}, ${screenId}, ${projectId}, ${region.label ?? null},
                    ${region.position?.x ?? 0}, ${region.position?.y ?? 0},
                    ${region.size?.width ?? 0}, ${region.size?.height ?? 0},
                    ${region.componentNodeId ?? null}, NOW(), NOW())
          `;
          if (region.elementIds) {
            for (let i = 0; i < region.elementIds.length; i++) {
              await sql!`
                INSERT INTO region_elements (region_id, node_id, position_order, created_at)
                VALUES (${regionId}, ${region.elementIds[i]}, ${i}, NOW())
              `;
            }
          }
        }
      }
    }
  }

  return {
    nodeCount: canvasState.nodes.length,
    edgeCount: canvasState.edges.length,
    screenCount: canvasState.screens?.length ?? 0,
  };
}

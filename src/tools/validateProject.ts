import { z } from 'zod';
import { getProject } from '../db.js';
import type { TransformData } from '../types.js';

export const validateProjectSchema = z.object({
  projectId: z.string().describe('UUID of the project to validate'),
});

// ─── Severity ────────────────────────────────────────────────────

type Severity = 'error' | 'warning' | 'info';

const SEVERITY_MAP: Record<string, Severity> = {
  // Errors (P1)
  'missing-source': 'error',
  'no-inputs': 'error',
  'no-outputs': 'error',
  'insufficient-workflow-members': 'error',
  'workflow-no-outputs': 'error',
  'component-no-datapoints': 'error',
  'circular-dependency': 'error',
  'orphan-node': 'error',
  // Warnings (P2)
  'wrong-source-type': 'warning',
  'multiple-sources': 'warning',
  'type-mismatch': 'warning',
  'invalid-capture-reference': 'warning',
  'invalid-display-reference': 'warning',
  'duplicate-label': 'warning',
  'datapoint-tbd-type': 'warning',
  'table-column-tbd': 'warning',
  'dangling-member-reference': 'warning',
  'nested-workflow': 'warning',
  'empty-workflow': 'warning',
  // Info (P3)
  'empty-screen': 'info',
};

function severity(violation: string): Severity {
  return SEVERITY_MAP[violation] ?? 'warning';
}

// ─── Validation Types ────────────────────────────────────────────

interface DataPointSourceIssue {
  violation: 'missing-source' | 'wrong-source-type' | 'multiple-sources';
  nodeId: string;
  label: string;
  source: string;
  expectedSourceTypes: string[];
  actualSourceTypes: string[];
  severity: Severity;
}

interface TransformIssue {
  violation: 'no-inputs' | 'no-outputs';
  nodeId: string;
  label: string;
  transformType: string;
  severity: Severity;
}

interface ComponentReferenceIssue {
  violation: 'invalid-capture-reference' | 'invalid-display-reference' | 'component-no-datapoints';
  nodeId: string;
  label: string;
  invalidRefs: string[];
  severity: Severity;
}

interface TableDataPointMismatch {
  violation: 'type-mismatch';
  dataPointId: string;
  dataPointLabel: string;
  dataPointType: string;
  tableId: string;
  tableLabel: string;
  columnName: string;
  columnType: string;
  severity: Severity;
}

interface CircularDependency {
  violation: 'circular-dependency';
  cycle: string[];
  labels: string[];
  severity: Severity;
}

interface WorkflowIssue {
  violation: 'empty-workflow' | 'insufficient-workflow-members' | 'workflow-no-outputs' | 'dangling-member-reference' | 'nested-workflow';
  nodeId: string;
  label: string;
  detail?: string;
  severity: Severity;
}

interface OrphanNodeIssue {
  violation: 'orphan-node';
  nodeId: string;
  label: string;
  nodeType: string;
  severity: Severity;
}

interface TbdIssue {
  violation: 'datapoint-tbd-type' | 'table-column-tbd';
  nodeId: string;
  label: string;
  detail?: string;
  severity: Severity;
}

interface DuplicateLabelIssue {
  violation: 'duplicate-label';
  nodeIds: string[];
  label: string;
  nodeType: string;
  severity: Severity;
}

// ─── Validation Functions ────────────────────────────────────────

/** Collect all transform IDs that are linked as workflow members */
function collectWorkflowMemberIds(nodes: any[]): Set<string> {
  const ids = new Set<string>();
  for (const n of nodes) {
    if (n.type !== 'transform') continue;
    const data = n.data as TransformData | undefined;
    if (data?.type !== 'workflow' || !data.members) continue;
    for (const m of data.members) {
      if (m.transformId) ids.add(m.transformId);
    }
  }
  return ids;
}

function validateDataPointSources(nodes: any[], edges: any[]): DataPointSourceIssue[] {
  const issues: DataPointSourceIssue[] = [];
  const dataPoints = nodes.filter((n) => n.type === 'datapoint');

  for (const dp of dataPoints) {
    const source = dp.data?.source ?? 'captured';
    const label = dp.data?.label ?? 'Untitled';

    // Include contains edges from screens (data flow), exclude from tables (structural)
    const incomingEdges = edges.filter((e) => {
      if (e.target !== dp.id) return false;
      if ((e.data?.edgeType as string) === 'contains') {
        const sourceNode = nodes.find((n: any) => n.id === e.source);
        return sourceNode?.type !== 'table';
      }
      return true;
    });
    const sourceNodeTypes = incomingEdges
      .map((e) => {
        const sourceNode = nodes.find((n) => n.id === e.source);
        return sourceNode?.type ?? 'unknown';
      })
      .filter((t) => t !== 'unknown');

    let expectedTypes: string[] = [];
    switch (source) {
      case 'captured':
        expectedTypes = ['screen', 'component'];
        break;
      case 'retrieved':
        expectedTypes = ['table', 'transform', 'component'];
        break;
      case 'inferred':
        expectedTypes = ['transform'];
        break;
    }

    if (incomingEdges.length === 0) {
      issues.push({
        violation: 'missing-source',
        nodeId: dp.id,
        label,
        source,
        expectedSourceTypes: expectedTypes,
        actualSourceTypes: [],
        severity: severity('missing-source'),
      });
      continue;
    }

    if (incomingEdges.length > 1) {
      issues.push({
        violation: 'multiple-sources',
        nodeId: dp.id,
        label,
        source,
        expectedSourceTypes: expectedTypes,
        actualSourceTypes: sourceNodeTypes,
        severity: severity('multiple-sources'),
      });
      continue;
    }

    const actualType = sourceNodeTypes[0];
    if (!expectedTypes.includes(actualType)) {
      issues.push({
        violation: 'wrong-source-type',
        nodeId: dp.id,
        label,
        source,
        expectedSourceTypes: expectedTypes,
        actualSourceTypes: [actualType],
        severity: severity('wrong-source-type'),
      });
    }
  }

  return issues;
}

function validateTransforms(nodes: any[], edges: any[]): TransformIssue[] {
  const issues: TransformIssue[] = [];
  // Only validate formula and validation transforms — workflows are handled separately
  const transforms = nodes.filter(
    (n) => n.type === 'transform' && (n.data?.type ?? 'formula') !== 'workflow'
  );

  for (const transform of transforms) {
    const label = transform.data?.label ?? 'Untitled';
    const transformType = transform.data?.type ?? 'formula';

    const incomingEdges = edges.filter((e) =>
      e.target === transform.id && (e.data?.edgeType as string) !== 'contains'
    );
    const outgoingEdges = edges.filter((e) =>
      e.source === transform.id && (e.data?.edgeType as string) !== 'contains'
    );

    if (incomingEdges.length === 0) {
      issues.push({
        violation: 'no-inputs',
        nodeId: transform.id,
        label,
        transformType,
        severity: severity('no-inputs'),
      });
    }

    if (outgoingEdges.length === 0) {
      issues.push({
        violation: 'no-outputs',
        nodeId: transform.id,
        label,
        transformType,
        severity: severity('no-outputs'),
      });
    }
  }

  return issues;
}

function validateComponentReferences(nodes: any[], edges: any[]): ComponentReferenceIssue[] {
  const issues: ComponentReferenceIssue[] = [];
  const components = nodes.filter((n) => n.type === 'component');
  const nodeIdSet = new Set(nodes.map((n) => n.id));
  const nodeLabelSet = new Set(nodes.map((n) => n.data?.label as string).filter(Boolean));

  for (const component of components) {
    const label = component.data?.label ?? 'Untitled';
    const captures = component.data?.captures ?? [];
    const displays = component.data?.displays ?? [];

    const invalidCaptures = captures.filter((ref: string) =>
      !nodeIdSet.has(ref) && !nodeLabelSet.has(ref)
    );
    if (invalidCaptures.length > 0) {
      issues.push({
        violation: 'invalid-capture-reference',
        nodeId: component.id,
        label,
        invalidRefs: invalidCaptures,
        severity: severity('invalid-capture-reference'),
      });
    }

    const invalidDisplays = displays.filter((ref: string) =>
      !nodeIdSet.has(ref) && !nodeLabelSet.has(ref)
    );
    if (invalidDisplays.length > 0) {
      issues.push({
        violation: 'invalid-display-reference',
        nodeId: component.id,
        label,
        invalidRefs: invalidDisplays,
        severity: severity('invalid-display-reference'),
      });
    }

    // Component must have at least 1 connected DataPoint edge
    const connectedEdges = edges.filter(
      (e) => e.source === component.id || e.target === component.id
    );
    const hasDataPointEdge = connectedEdges.some((e) => {
      const otherNodeId = e.source === component.id ? e.target : e.source;
      const otherNode = nodes.find((n) => n.id === otherNodeId);
      return otherNode?.type === 'datapoint';
    });
    if (!hasDataPointEdge) {
      issues.push({
        violation: 'component-no-datapoints',
        nodeId: component.id,
        label,
        invalidRefs: [],
        severity: severity('component-no-datapoints'),
      });
    }
  }

  return issues;
}

function validateTableDataPointTypes(nodes: any[], edges: any[]): TableDataPointMismatch[] {
  const issues: TableDataPointMismatch[] = [];
  const dataPoints = nodes.filter((n) => n.type === 'datapoint');
  const tables = nodes.filter((n) => n.type === 'table');

  for (const dp of dataPoints) {
    if (dp.data?.source !== 'retrieved') continue;

    const tableEdges = edges.filter((e) => {
      if (e.target !== dp.id) return false;
      const sourceNode = nodes.find((n) => n.id === e.source);
      return sourceNode?.type === 'table';
    });

    for (const edge of tableEdges) {
      const table = tables.find((t) => t.id === edge.source);
      if (!table) continue;

      const dpLabel = (dp.data?.label ?? '').toLowerCase().trim();
      const matchingColumn = (table.data?.columns ?? []).find(
        (col: any) => col.name.toLowerCase().trim() === dpLabel
      );

      if (matchingColumn && matchingColumn.type !== dp.data?.type
          && dp.data?.type !== 'tbd' && matchingColumn.type !== 'tbd') {
        issues.push({
          violation: 'type-mismatch',
          dataPointId: dp.id,
          dataPointLabel: dp.data?.label ?? 'Untitled',
          dataPointType: dp.data?.type ?? 'unknown',
          tableId: table.id,
          tableLabel: table.data?.label ?? 'Untitled',
          columnName: matchingColumn.name,
          columnType: matchingColumn.type,
          severity: severity('type-mismatch'),
        });
      }
    }
  }

  return issues;
}

function detectCircularDependencies(nodes: any[], edges: any[]): CircularDependency[] {
  const issues: CircularDependency[] = [];

  const adjacency = new Map<string, string[]>();
  for (const node of nodes) {
    adjacency.set(node.id, []);
  }

  for (const edge of edges) {
    const edgeType = edge.data?.edgeType;
    if (edgeType === 'derives-from' || edgeType === 'transforms') {
      const targets = adjacency.get(edge.source) ?? [];
      targets.push(edge.target);
      adjacency.set(edge.source, targets);
    }
  }

  const visited = new Set<string>();
  const recStack = new Set<string>();
  const cycles: string[][] = [];

  function dfs(nodeId: string, path: string[]): void {
    visited.add(nodeId);
    recStack.add(nodeId);
    path.push(nodeId);

    const neighbors = adjacency.get(nodeId) ?? [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs(neighbor, [...path]);
      } else if (recStack.has(neighbor)) {
        const cycleStart = path.indexOf(neighbor);
        const cycle = path.slice(cycleStart);
        cycles.push([...cycle, neighbor]);
      }
    }

    recStack.delete(nodeId);
  }

  for (const node of nodes) {
    if (!visited.has(node.id)) {
      dfs(node.id, []);
    }
  }

  const seenCycles = new Set<string>();
  for (const cycle of cycles) {
    const normalized = [...cycle].sort().join('->');
    if (seenCycles.has(normalized)) continue;
    seenCycles.add(normalized);

    const labels = cycle.map((id) => {
      const node = nodes.find((n) => n.id === id);
      return node?.data?.label ?? 'Unknown';
    });

    issues.push({
      violation: 'circular-dependency',
      cycle,
      labels,
      severity: severity('circular-dependency'),
    });
  }

  return issues;
}

// ─── Workflow Validation ─────────────────────────────────────────

function validateWorkflows(nodes: any[], edges: any[]): WorkflowIssue[] {
  const issues: WorkflowIssue[] = [];
  const nodeIdSet = new Set(nodes.map((n) => n.id));

  for (const n of nodes) {
    if (n.type !== 'transform') continue;
    const data = n.data as TransformData | undefined;
    if (!data || data.type !== 'workflow') continue;

    const label = data.label;

    // Empty workflow
    if (!data.members || data.members.length === 0) {
      issues.push({
        violation: 'empty-workflow',
        nodeId: n.id,
        label,
        severity: severity('empty-workflow'),
      });
      continue;
    }

    // Insufficient members (need at least 2)
    if (data.members.length < 2) {
      issues.push({
        violation: 'insufficient-workflow-members',
        nodeId: n.id,
        label,
        detail: `Workflow has only ${data.members.length} member (need at least 2)`,
        severity: severity('insufficient-workflow-members'),
      });
    }

    // Workflow must have at least 1 output edge
    const outgoingEdges = edges.filter((e) => e.source === n.id);
    if (outgoingEdges.length === 0) {
      issues.push({
        violation: 'workflow-no-outputs',
        nodeId: n.id,
        label,
        detail: 'Workflow has no output connections',
        severity: severity('workflow-no-outputs'),
      });
    }

    // Dangling member references
    for (const m of data.members) {
      if (m.transformId && !nodeIdSet.has(m.transformId)) {
        issues.push({
          violation: 'dangling-member-reference',
          nodeId: n.id,
          label,
          detail: `Member "${m.name}" references missing transform ${m.transformId}`,
          severity: severity('dangling-member-reference'),
        });
      }
    }

    // Nested workflows (member is itself a workflow)
    for (const m of data.members) {
      if (!m.transformId) continue;
      const memberNode = nodes.find((mn) => mn.id === m.transformId);
      if (memberNode?.type === 'transform' && memberNode.data?.type === 'workflow') {
        issues.push({
          violation: 'nested-workflow',
          nodeId: n.id,
          label,
          detail: `Member "${m.name}" is itself a workflow (nesting not supported)`,
          severity: severity('nested-workflow'),
        });
      }
    }
  }

  return issues;
}

// ─── Orphan Node Detection ───────────────────────────────────────

function validateOrphans(nodes: any[], edges: any[]): OrphanNodeIssue[] {
  const issues: OrphanNodeIssue[] = [];
  const connectedIds = new Set<string>();
  for (const e of edges) {
    connectedIds.add(e.source);
    connectedIds.add(e.target);
  }

  for (const n of nodes) {
    if (n.type === 'image' || n.type === 'screen') continue;
    if (!connectedIds.has(n.id)) {
      issues.push({
        violation: 'orphan-node',
        nodeId: n.id,
        label: n.data?.label ?? 'Untitled',
        nodeType: n.type ?? 'unknown',
        severity: severity('orphan-node'),
      });
    }
  }

  return issues;
}

// ─── TBD Issue Detection ─────────────────────────────────────────

function validateTbdIssues(nodes: any[]): TbdIssue[] {
  const issues: TbdIssue[] = [];

  for (const n of nodes) {
    if (n.type === 'datapoint' && n.data?.type === 'tbd') {
      issues.push({
        violation: 'datapoint-tbd-type',
        nodeId: n.id,
        label: n.data?.label ?? 'Untitled',
        detail: 'DataPoint type is TBD',
        severity: severity('datapoint-tbd-type'),
      });
    }

    if (n.type === 'table') {
      for (const col of (n.data?.columns ?? [])) {
        if (col.type === 'tbd') {
          issues.push({
            violation: 'table-column-tbd',
            nodeId: n.id,
            label: n.data?.label ?? 'Untitled',
            detail: `Column "${col.name}" has type TBD`,
            severity: severity('table-column-tbd'),
          });
        }
      }
    }
  }

  return issues;
}

// ─── Duplicate Label Detection ───────────────────────────────────

function validateDuplicateLabels(nodes: any[]): DuplicateLabelIssue[] {
  const issues: DuplicateLabelIssue[] = [];
  const groups = new Map<string, { ids: string[]; type: string }>();

  for (const n of nodes) {
    if (n.type === 'image' || n.type === 'screen') continue;
    const label = ((n.data?.label ?? '') as string).trim().toLowerCase();
    if (!label) continue;
    const key = `${n.type}:${label}`;
    const group = groups.get(key) ?? { ids: [] as string[], type: n.type ?? 'unknown' };
    group.ids.push(n.id);
    groups.set(key, group);
  }

  for (const [, group] of groups) {
    if (group.ids.length < 2) continue;
    // Use original-case label from first node
    const firstNode = nodes.find((n) => n.id === group.ids[0]);
    issues.push({
      violation: 'duplicate-label',
      nodeIds: group.ids,
      label: firstNode?.data?.label ?? '',
      nodeType: group.type,
      severity: severity('duplicate-label'),
    });
  }

  return issues;
}

// ─── Main Handler ────────────────────────────────────────────────

export async function handleValidateProject(args: z.infer<typeof validateProjectSchema>) {
  const project = await getProject(args.projectId);

  if (!project) {
    return {
      content: [{ type: 'text' as const, text: `Project not found: ${args.projectId}` }],
      isError: true,
    };
  }

  const nodes = project.canvas_state?.nodes ?? [];
  const edges = project.canvas_state?.edges ?? [];
  const screens = (project.canvas_state?.screens ?? []) as Array<{
    id: string;
    name: string;
    regions: Array<{ elementIds: string[] }>;
  }>;

  // Build set of workflow member IDs to exclude from standard validation
  const workflowMemberIds = collectWorkflowMemberIds(nodes);
  const nonMemberNodes = nodes.filter((n) => !workflowMemberIds.has(n.id));

  // Run all validators
  const dataPointSourceIssues = validateDataPointSources(nonMemberNodes, edges);
  const transformIssues = validateTransforms(nonMemberNodes, edges);
  const componentReferenceIssues = validateComponentReferences(nonMemberNodes, edges);
  const tableDataPointMismatches = validateTableDataPointTypes(nonMemberNodes, edges);
  const circularDependencies = detectCircularDependencies(nonMemberNodes, edges);
  const workflowIssues = validateWorkflows(nodes, edges);
  const orphanIssues = validateOrphans(nonMemberNodes, edges);
  const tbdIssues = validateTbdIssues(nonMemberNodes);
  const duplicateLabelIssues = validateDuplicateLabels(nonMemberNodes);

  // Gather all issues and compute severity counts
  const allIssues: { severity: Severity }[] = [
    ...dataPointSourceIssues,
    ...transformIssues,
    ...componentReferenceIssues,
    ...tableDataPointMismatches,
    ...circularDependencies,
    ...workflowIssues,
    ...orphanIssues,
    ...tbdIssues,
    ...duplicateLabelIssues,
  ];

  const totalIssues = allIssues.length;
  const errorCount = allIssues.filter((i) => i.severity === 'error').length;
  const warningCount = allIssues.filter((i) => i.severity === 'warning').length;
  const infoCount = allIssues.filter((i) => i.severity === 'info').length;

  // Format output
  const lines: string[] = [];
  lines.push(`## Data Flow Validation for ${project.name}`);

  if (totalIssues === 0) {
    lines.push('');
    lines.push('All data flow rules passed — no issues found.');
    return {
      content: [{ type: 'text' as const, text: lines.join('\n') }],
    };
  }

  lines.push('');
  lines.push(`**${totalIssues} issue${totalIssues !== 1 ? 's' : ''} found** — ${errorCount} error${errorCount !== 1 ? 's' : ''}, ${warningCount} warning${warningCount !== 1 ? 's' : ''}, ${infoCount} info`);

  // DataPoint Source Issues
  if (dataPointSourceIssues.length > 0) {
    lines.push('');
    lines.push(`### DataPoint Source Issues (${dataPointSourceIssues.length})`);
    for (const issue of dataPointSourceIssues) {
      lines.push(`- [${issue.severity}] **${issue.label}** (${issue.source}): ${issue.violation.replace(/-/g, ' ')}`);
      lines.push(`  - Expected: ${issue.expectedSourceTypes.join(', ')}`);
      if (issue.actualSourceTypes.length > 0) {
        lines.push(`  - Actual: ${issue.actualSourceTypes.join(', ')}`);
      }
    }
  }

  // Transform Issues
  if (transformIssues.length > 0) {
    lines.push('');
    lines.push(`### Transform Issues (${transformIssues.length})`);
    for (const issue of transformIssues) {
      lines.push(`- [${issue.severity}] **${issue.label}** (${issue.transformType}): ${issue.violation.replace(/-/g, ' ')}`);
    }
  }

  // Workflow Issues
  if (workflowIssues.length > 0) {
    lines.push('');
    lines.push(`### Workflow Issues (${workflowIssues.length})`);
    for (const issue of workflowIssues) {
      lines.push(`- [${issue.severity}] **${issue.label}**: ${issue.violation.replace(/-/g, ' ')}${issue.detail ? ` — ${issue.detail}` : ''}`);
    }
  }

  // Component Reference Issues
  if (componentReferenceIssues.length > 0) {
    lines.push('');
    lines.push(`### Component Reference Issues (${componentReferenceIssues.length})`);
    for (const issue of componentReferenceIssues) {
      lines.push(`- [${issue.severity}] **${issue.label}**: ${issue.violation.replace(/-/g, ' ')}`);
      if (issue.invalidRefs.length > 0) {
        lines.push(`  - Invalid IDs: ${issue.invalidRefs.join(', ')}`);
      }
    }
  }

  // Table/DataPoint Type Mismatches
  if (tableDataPointMismatches.length > 0) {
    lines.push('');
    lines.push(`### Type Mismatches (${tableDataPointMismatches.length})`);
    for (const issue of tableDataPointMismatches) {
      lines.push(
        `- [${issue.severity}] **${issue.dataPointLabel}** (${issue.dataPointType}) <- **${issue.tableLabel}.${issue.columnName}** (${issue.columnType})`
      );
    }
  }

  // Circular Dependencies
  if (circularDependencies.length > 0) {
    lines.push('');
    lines.push(`### Circular Dependencies (${circularDependencies.length})`);
    for (const issue of circularDependencies) {
      lines.push(`- [${issue.severity}] Cycle: ${issue.labels.join(' -> ')}`);
    }
  }

  // Orphan Nodes
  if (orphanIssues.length > 0) {
    lines.push('');
    lines.push(`### Orphan Nodes (${orphanIssues.length})`);
    for (const issue of orphanIssues) {
      lines.push(`- [${issue.severity}] **${issue.label}** (${issue.nodeType}) — no edges`);
    }
  }

  // TBD Issues
  if (tbdIssues.length > 0) {
    lines.push('');
    lines.push(`### TBD Issues (${tbdIssues.length})`);
    for (const issue of tbdIssues) {
      lines.push(`- [${issue.severity}] **${issue.label}**: ${issue.detail ?? issue.violation.replace(/-/g, ' ')}`);
    }
  }

  // Duplicate Labels
  if (duplicateLabelIssues.length > 0) {
    lines.push('');
    lines.push(`### Duplicate Labels (${duplicateLabelIssues.length})`);
    for (const issue of duplicateLabelIssues) {
      lines.push(`- [${issue.severity}] **${issue.label}** (${issue.nodeType}) — ${issue.nodeIds.length} nodes with same label`);
    }
  }

  return {
    content: [{ type: 'text' as const, text: lines.join('\n') }],
  };
}

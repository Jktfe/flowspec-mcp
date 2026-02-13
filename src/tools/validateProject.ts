import { z } from 'zod';
import { getProject } from '../db.js';

export const validateProjectSchema = z.object({
  projectId: z.string().describe('UUID of the project to validate'),
});

// ─── Validation Types ────────────────────────────────────────────

interface DataPointSourceIssue {
  violation: 'missing-source' | 'wrong-source-type' | 'multiple-sources';
  nodeId: string;
  label: string;
  source: string;
  expectedSourceTypes: string[];
  actualSourceTypes: string[];
}

interface TransformIssue {
  violation: 'no-inputs' | 'no-outputs';
  nodeId: string;
  label: string;
  transformType: string;
}

interface ComponentReferenceIssue {
  violation: 'invalid-capture-reference' | 'invalid-display-reference';
  nodeId: string;
  label: string;
  invalidRefs: string[];
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
}

interface CircularDependency {
  violation: 'circular-dependency';
  cycle: string[];
  labels: string[];
}

// ─── Validation Functions ────────────────────────────────────────

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
      });
    }
  }

  return issues;
}

function validateTransforms(nodes: any[], edges: any[]): TransformIssue[] {
  const issues: TransformIssue[] = [];
  const transforms = nodes.filter((n) => n.type === 'transform');

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
      });
    }

    if (outgoingEdges.length === 0) {
      issues.push({
        violation: 'no-outputs',
        nodeId: transform.id,
        label,
        transformType,
      });
    }
  }

  return issues;
}

function validateComponentReferences(nodes: any[]): ComponentReferenceIssue[] {
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

  // Run all validators
  const dataPointSourceIssues = validateDataPointSources(nodes, edges);
  const transformIssues = validateTransforms(nodes, edges);
  const componentReferenceIssues = validateComponentReferences(nodes);
  const tableDataPointMismatches = validateTableDataPointTypes(nodes, edges);
  const circularDependencies = detectCircularDependencies(nodes, edges);

  const totalIssues =
    dataPointSourceIssues.length +
    transformIssues.length +
    componentReferenceIssues.length +
    tableDataPointMismatches.length +
    circularDependencies.length;

  // Format output
  const lines: string[] = [];
  lines.push(`## Data Flow Validation for ${project.name}`);

  if (totalIssues === 0) {
    lines.push('');
    lines.push('✅ **All data flow rules passed!**');
    return {
      content: [{ type: 'text' as const, text: lines.join('\n') }],
    };
  }

  lines.push('');
  lines.push(`⚠️ **${totalIssues} issue${totalIssues !== 1 ? 's' : ''} found** (all warnings)`);

  // DataPoint Source Issues
  if (dataPointSourceIssues.length > 0) {
    lines.push('');
    lines.push(`### DataPoint Source Issues (${dataPointSourceIssues.length})`);
    for (const issue of dataPointSourceIssues) {
      lines.push(`- **${issue.label}** (${issue.source}): ${issue.violation.replace(/-/g, ' ')}`);
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
      lines.push(`- **${issue.label}** (${issue.transformType}): ${issue.violation.replace(/-/g, ' ')}`);
    }
  }

  // Component Reference Issues
  if (componentReferenceIssues.length > 0) {
    lines.push('');
    lines.push(`### Component Reference Issues (${componentReferenceIssues.length})`);
    for (const issue of componentReferenceIssues) {
      lines.push(`- **${issue.label}**: ${issue.violation.replace(/-/g, ' ')}`);
      lines.push(`  - Invalid IDs: ${issue.invalidRefs.join(', ')}`);
    }
  }

  // Table/DataPoint Type Mismatches
  if (tableDataPointMismatches.length > 0) {
    lines.push('');
    lines.push(`### Type Mismatches (${tableDataPointMismatches.length})`);
    for (const issue of tableDataPointMismatches) {
      lines.push(
        `- **${issue.dataPointLabel}** (${issue.dataPointType}) ← **${issue.tableLabel}.${issue.columnName}** (${issue.columnType})`
      );
    }
  }

  // Circular Dependencies
  if (circularDependencies.length > 0) {
    lines.push('');
    lines.push(`### Circular Dependencies (${circularDependencies.length})`);
    for (const issue of circularDependencies) {
      lines.push(`- Cycle: ${issue.labels.join(' → ')}`);
    }
  }

  return {
    content: [{ type: 'text' as const, text: lines.join('\n') }],
  };
}

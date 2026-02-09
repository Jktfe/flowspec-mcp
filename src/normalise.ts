/**
 * Normalises MCP input data into the format the FlowSpec web app expects.
 *
 * The MCP accepts a simplified schema (e.g. `dataType`, flat `constraints`
 * string, `transformType`) for convenience when called by Claude Code.
 * The web app's Svelte Flow components expect a stricter shape — this
 * module bridges the two.
 */

type NodeType = 'datapoint' | 'component' | 'transform' | 'table';

function normaliseDataPoint(data: Record<string, unknown>): Record<string, unknown> {
  const out = { ...data };

  // dataType → type (MCP uses 'dataType' to avoid collision with the node-level 'type')
  if ('dataType' in out && !('type' in out)) {
    out.type = out.dataType;
    delete out.dataType;
  }

  // constraints: string → string[]
  if (typeof out.constraints === 'string') {
    out.constraints = out.constraints
      ? (out.constraints as string).split(',').map((s: string) => s.trim()).filter(Boolean)
      : [];
  }
  if (!Array.isArray(out.constraints)) out.constraints = [];

  // Defaults
  if (!out.source) out.source = 'captured';
  if (out.sourceDefinition === undefined) out.sourceDefinition = '';

  return out;
}

function normaliseComponent(data: Record<string, unknown>): Record<string, unknown> {
  const out = { ...data };
  if (!Array.isArray(out.displays)) out.displays = [];
  if (!Array.isArray(out.captures)) out.captures = [];
  return out;
}

function normaliseTransform(data: Record<string, unknown>): Record<string, unknown> {
  const out = { ...data };

  // transformType → type
  if ('transformType' in out && !('type' in out)) {
    out.type = out.transformType;
    delete out.transformType;
  }

  const transformType = (out.type as string) ?? 'formula';

  // logic: string → { type, content }
  if (typeof out.logic === 'string') {
    const logicMap: Record<string, string> = {
      formula: 'formula',
      validation: 'formula',
      workflow: 'steps',
    };
    out.logic = {
      type: logicMap[transformType] ?? 'formula',
      content: out.logic,
    };
  }

  // Defaults
  if (!out.description) out.description = (out.label as string) ?? '';
  if (!Array.isArray(out.inputs)) out.inputs = [];
  if (!Array.isArray(out.outputs)) out.outputs = [];

  return out;
}

/**
 * Normalise node data from the MCP's simplified input into the web-app format.
 * Safe to call on data that's already in the correct format — it won't break it.
 */
export function normaliseNodeData(
  nodeType: NodeType,
  data: Record<string, unknown>
): Record<string, unknown> {
  switch (nodeType) {
    case 'datapoint': return normaliseDataPoint(data);
    case 'component': return normaliseComponent(data);
    case 'transform': return normaliseTransform(data);
    case 'table':     return data; // table format already matches
    default:          return data;
  }
}

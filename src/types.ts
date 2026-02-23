// Minimal types for FlowSpec MCP server — no @xyflow/svelte dependency

export type DataType = 'string' | 'number' | 'boolean' | 'object' | 'array';
export type SourceType = 'captured' | 'retrieved' | 'inferred';
export type LogicType = 'formula' | 'validation' | 'workflow';
export type TableSourceType = 'database' | 'api' | 'file' | 'manual';
export type EdgeType = 'flows-to';

export interface DataPointData {
  label: string;
  type: DataType;
  source: SourceType;
  sourceDefinition: string;
  constraints: string[];
}

export interface ComponentData {
  label: string;
  wireframeRef?: string;
  displays: string[];
  captures: string[];
}

// Workflow member: a named step inside a workflow transform
export interface WorkflowMember {
  name: string;
  transformId?: string;     // optional ref to an existing transform node
  logicType?: LogicType;    // hint for display when unlinked
}

export interface TransformData {
  label: string;
  type: LogicType;
  description: string;
  inputs: string[];
  outputs: string[];
  logic: {
    type: 'formula' | 'decision_table' | 'steps';
    content: string | Record<string, unknown>;
  };
  members?: WorkflowMember[];  // only when type === 'workflow'
}

export interface TableData {
  label: string;
  columns: Array<{ name: string; type: DataType }>;
  sourceType: TableSourceType;
  endpoint?: string;
}

// A rectangular region on a screen that groups multiple elements
export interface ScreenRegion {
  id: string;
  label?: string | null;
  position: { x: number; y: number }; // top-left corner, percentage (0-100)
  size: { width: number; height: number }; // percentage (0-100)
  elementIds: string[]; // references to main canvas node IDs
  componentNodeId?: string | null; // when promoted, references a component node on the main canvas
}

export interface Screen {
  id: string;
  name: string;
  imageUrl: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  imageFilename?: string | null;
  regions: ScreenRegion[];
}

export interface CanvasNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  type?: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  data?: Record<string, unknown>;
}

// Decision Tree types
export interface DecisionTreeSummary {
  id: string;
  name: string;
  description: string | null;
  generated_from_node_id: string | null;
  generated_from_node_label: string | null;
  trace_depth: number;
  created_at: string;
  updated_at: string;
}

export interface DecisionTreeFull extends DecisionTreeSummary {
  tree_data: {
    nodes: Array<{
      id: string;
      type: 'decision' | 'outcome' | 'action' | 'start';
      label: string;
      description?: string;
      condition?: { field: string; operator: string; value?: string };
      outcome?: { result: string; confidence?: number };
      sourceNodeId?: string;
    }>;
    edges: Array<{
      id: string;
      source: string;
      target: string;
      label: string;
      isDefault?: boolean;
    }>;
    rootNodeId: string;
  };
}

export interface Project {
  id: string;
  name: string;
  canvas_state: {
    nodes: CanvasNode[];
    edges: CanvasEdge[];
    screens?: Screen[];
    backgroundImage?: unknown | null;
  };
  thumbnail_url: string | null;
  user_id: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

// Minimal types for FlowSpec MCP server — no @xyflow/svelte dependency

export type DataType = 'string' | 'number' | 'boolean' | 'object' | 'array';
export type SourceType = 'captured' | 'inferred';
export type LogicType = 'formula' | 'validation' | 'workflow';
export type TableSourceType = 'database' | 'api' | 'file' | 'manual';
export type EdgeType = 'flows-to' | 'derives-from' | 'transforms' | 'validates' | 'contains';

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
  label?: string;
  position: { x: number; y: number }; // top-left corner, percentage (0-100)
  size: { width: number; height: number }; // percentage (0-100)
  elementIds: string[]; // references to main canvas node IDs
  componentNodeId?: string; // when promoted, references a component node on the main canvas
}

export interface Screen {
  id: string;
  name: string;
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  imageFilename?: string;
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
  data?: Record<string, unknown>;
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

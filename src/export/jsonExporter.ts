import type {
  CanvasNode,
  CanvasEdge,
  DataPointData,
  ComponentData,
  TransformData,
  TableData,
  TableSourceType,
  EdgeType,
  Screen,
} from '../types.js';

interface ExportMetadata {
  projectName: string;
  exportedAt: string;
  nodeCount: number;
  edgeCount: number;
}

interface ExportDataPoint {
  id: string;
  label: string;
  type: string;
  source: 'captured' | 'inferred';
  sourceDefinition: string;
  constraints: string[];
  locations: Array<{ component: string; role: 'input' | 'output' }>;
}

interface ExportComponent {
  id: string;
  label: string;
  wireframeRef?: string;
  displays: string[];
  captures: string[];
}

interface ExportTransform {
  id: string;
  type: string;
  description: string;
  inputs: string[];
  outputs: string[];
  logic: {
    type: string;
    content: string | Record<string, unknown>;
  };
}

interface ExportTable {
  id: string;
  label: string;
  sourceType: TableSourceType;
  columns: Array<{ name: string; type: string }>;
  endpoint?: string;
}

interface ExportDataFlow {
  from: string;
  to: string;
  edgeType: EdgeType;
  label?: string;
}

interface ExportScreenRegion {
  id: string;
  label?: string | null;
  position: { x: number; y: number };
  size: { width: number; height: number };
  elements: Array<{
    nodeId: string;
    nodeLabel: string;
    nodeType: string;
  }>;
  componentNodeId?: string | null;
}

interface ExportScreen {
  id: string;
  name: string;
  imageFilename?: string | null;
  regions: ExportScreenRegion[];
}

interface ExportSpec {
  version: string;
  metadata: ExportMetadata;
  dataPoints: ExportDataPoint[];
  components: ExportComponent[];
  transforms: ExportTransform[];
  tables?: ExportTable[];
  dataFlow: ExportDataFlow[];
  screens?: ExportScreen[];
}

/**
 * Exports canvas state to JSON specification optimised for Claude Code.
 * Adapted from web app — uses plain interfaces instead of @xyflow/svelte types.
 */
export function exportToJson(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  projectName: string = 'Untitled Project',
  screens: Screen[] = []
): string {
  const exportableNodes = nodes.filter((n) => n.type !== 'image' && n.type !== 'screen');

  const dataPointNodes = exportableNodes.filter((n) => n.type === 'datapoint');
  const componentNodes = exportableNodes.filter((n) => n.type === 'component');
  const transformNodes = exportableNodes.filter((n) => n.type === 'transform');
  const tableNodes = exportableNodes.filter((n) => n.type === 'table');

  const locationMap = buildLocationMap(dataPointNodes, componentNodes, edges);

  // Build node label lookup for screen region export
  const nodeLabelMap = new Map<string, { label: string; type: string }>();
  for (const n of exportableNodes) {
    const label = (n.data as { label?: string }).label ?? 'Untitled';
    nodeLabelMap.set(n.id, { label, type: n.type ?? 'unknown' });
  }

  const spec: ExportSpec = {
    version: '1.2.0',
    metadata: {
      projectName,
      exportedAt: new Date().toISOString(),
      nodeCount: exportableNodes.length,
      edgeCount: edges.length,
    },
    dataPoints: dataPointNodes.map((node) => {
      const data = node.data as unknown as DataPointData;
      return {
        id: node.id,
        label: data.label,
        type: data.type,
        source: data.source,
        sourceDefinition: data.sourceDefinition,
        constraints: data.constraints,
        locations: locationMap.get(node.id) ?? [],
      };
    }),
    components: componentNodes.map((node) => {
      const data = node.data as unknown as ComponentData;
      const result: ExportComponent = {
        id: node.id,
        label: data.label,
        displays: data.displays,
        captures: data.captures,
      };
      if (data.wireframeRef) {
        result.wireframeRef = data.wireframeRef;
      }
      return result;
    }),
    transforms: transformNodes.map((node) => {
      const data = node.data as unknown as TransformData;
      return {
        id: node.id,
        type: data.type,
        description: data.description,
        inputs: data.inputs,
        outputs: data.outputs,
        logic: data.logic,
      };
    }),
    dataFlow: edges.filter((e) => {
      return (e.data?.edgeType as string) !== 'contains';
    }).map((edge) => {
      const result: ExportDataFlow = {
        from: edge.source,
        to: edge.target,
        edgeType: (edge.data?.edgeType as EdgeType) ?? 'flows-to',
      };
      if (edge.data?.label) {
        result.label = edge.data.label as string;
      }
      return result;
    }),
  };

  // Add tables section if table nodes exist
  if (tableNodes.length > 0) {
    spec.tables = tableNodes.map((node) => {
      const data = node.data as unknown as TableData;
      const result: ExportTable = {
        id: node.id,
        label: data.label,
        sourceType: data.sourceType,
        columns: (data.columns ?? []).map((c) => ({ name: c.name, type: c.type })),
      };
      if (data.endpoint) {
        result.endpoint = data.endpoint;
      }
      return result;
    });
  }

  // Add screens section if screens exist
  if (screens.length > 0) {
    spec.screens = screens.map((sc) => ({
      id: sc.id,
      name: sc.name,
      imageFilename: sc.imageFilename,
      regions: sc.regions.map((r) => {
        const region: ExportScreenRegion = {
          id: r.id,
          label: r.label,
          position: {
            x: Math.round(r.position.x * 10) / 10,
            y: Math.round(r.position.y * 10) / 10,
          },
          size: {
            width: Math.round(r.size.width * 10) / 10,
            height: Math.round(r.size.height * 10) / 10,
          },
          elements: r.elementIds.map((eid) => {
            const info = nodeLabelMap.get(eid);
            return {
              nodeId: eid,
              nodeLabel: info?.label ?? 'Missing element',
              nodeType: info?.type ?? 'unknown',
            };
          }),
        };
        if (r.componentNodeId) {
          region.componentNodeId = r.componentNodeId;
        }
        return region;
      }),
    }));
  }

  return JSON.stringify(spec, null, 2);
}

function buildLocationMap(
  dataPoints: CanvasNode[],
  components: CanvasNode[],
  edges: CanvasEdge[]
): Map<string, Array<{ component: string; role: 'input' | 'output' }>> {
  const map = new Map<string, Array<{ component: string; role: 'input' | 'output' }>>();

  for (const dp of dataPoints) {
    map.set(dp.id, []);
  }

  for (const edge of edges) {
    const sourceIsDataPoint = dataPoints.some((n) => n.id === edge.source);
    const targetIsComponent = components.some((n) => n.id === edge.target);

    if (sourceIsDataPoint && targetIsComponent) {
      const locations = map.get(edge.source) ?? [];
      locations.push({ component: edge.target, role: 'output' });
      map.set(edge.source, locations);
    }

    const sourceIsComponent = components.some((n) => n.id === edge.source);
    const targetIsDataPoint = dataPoints.some((n) => n.id === edge.target);

    if (sourceIsComponent && targetIsDataPoint) {
      const locations = map.get(edge.target) ?? [];
      locations.push({ component: edge.source, role: 'input' });
      map.set(edge.target, locations);
    }
  }

  return map;
}

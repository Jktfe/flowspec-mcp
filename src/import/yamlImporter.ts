/**
 * Converts a validated YAML spec back into FlowSpec canvas nodes and edges.
 * Ported from src/lib/import/yamlImporter.ts — uses MCP types, no @xyflow deps.
 * Lenient: uses sensible defaults for missing fields, skips broken edges.
 */
import type { CanvasNode, CanvasEdge, Screen, ScreenRegion, DataType, SourceType, LogicType, EdgeType, TableSourceType } from '../types.js';

export interface ImportResult {
	nodes: CanvasNode[];
	edges: CanvasEdge[];
	screens: Screen[];
	projectName: string;
	stats: {
		dataPoints: number;
		components: number;
		transforms: number;
		tables: number;
		edges: number;
		skippedEdges: number;
		skippedNodes: number;
	};
}

export function importFromYaml(spec: Record<string, unknown>): ImportResult {
	const metadata = (spec.metadata ?? {}) as Record<string, unknown>;
	const projectName = (metadata.projectName as string) ?? 'Imported Project';

	const rawDataPoints = (spec.dataPoints as Record<string, unknown>[]) ?? [];
	const rawComponents = (spec.components as Record<string, unknown>[]) ?? [];
	const rawTransforms = (spec.transforms as Record<string, unknown>[]) ?? [];
	const rawDataFlow = (spec.dataFlow as Record<string, unknown>[]) ?? [];
	const rawTables = (spec.tables as Record<string, unknown>[]) ?? [];

	const nodes: CanvasNode[] = [];
	const seenIds = new Set<string>();
	let skippedNodes = 0;

	// --- DataPoints ---
	for (const dp of rawDataPoints) {
		const id = dp.id as string | undefined;
		if (!id || seenIds.has(id)) {
			skippedNodes++;
			continue;
		}
		seenIds.add(id);

		nodes.push({
			id,
			type: 'datapoint',
			position: { x: 0, y: 0 },
			data: {
				label: (dp.label as string) ?? 'Untitled',
				type: validDataType(dp.type as string),
				source: validSource(dp.source as string),
				sourceDefinition: (dp.sourceDefinition as string) ?? '',
				constraints: Array.isArray(dp.constraints) ? (dp.constraints as string[]) : []
			}
		});
	}

	// --- Components ---
	for (const comp of rawComponents) {
		const id = comp.id as string | undefined;
		if (!id || seenIds.has(id)) {
			skippedNodes++;
			continue;
		}
		seenIds.add(id);

		const data: Record<string, unknown> = {
			label: (comp.label as string) ?? 'Untitled Component',
			displays: Array.isArray(comp.displays) ? (comp.displays as string[]) : [],
			captures: Array.isArray(comp.captures) ? (comp.captures as string[]) : []
		};
		if (comp.wireframeRef) {
			data.wireframeRef = comp.wireframeRef as string;
		}

		nodes.push({ id, type: 'component', position: { x: 0, y: 0 }, data });
	}

	// --- Transforms ---
	for (const tx of rawTransforms) {
		const id = tx.id as string | undefined;
		if (!id || seenIds.has(id)) {
			skippedNodes++;
			continue;
		}
		seenIds.add(id);

		const description = (tx.description as string) ?? '';
		const rawLogic = (tx.logic ?? {}) as Record<string, unknown>;

		nodes.push({
			id,
			type: 'transform',
			position: { x: 0, y: 0 },
			data: {
				label: description || 'Untitled Transform',
				type: validLogicType(tx.type as string),
				description,
				inputs: Array.isArray(tx.inputs) ? (tx.inputs as string[]) : [],
				outputs: Array.isArray(tx.outputs) ? (tx.outputs as string[]) : [],
				logic: {
					type: validLogicContentType(rawLogic.type as string),
					content: (rawLogic.content as string | Record<string, unknown>) ?? ''
				}
			}
		});
	}

	// --- Tables ---
	for (const tbl of rawTables) {
		const id = tbl.id as string | undefined;
		if (!id || seenIds.has(id)) {
			skippedNodes++;
			continue;
		}
		seenIds.add(id);

		const rawColumns = Array.isArray(tbl.columns) ? (tbl.columns as Record<string, unknown>[]) : [];
		const columns = rawColumns.map((c) => ({
			name: (c.name as string) ?? '',
			type: validDataType(c.type as string)
		}));

		nodes.push({
			id,
			type: 'table',
			position: { x: 0, y: 0 },
			data: {
				label: (tbl.label as string) ?? 'Untitled Table',
				sourceType: validTableSourceType(tbl.sourceType as string),
				columns,
				endpoint: (tbl.endpoint as string) ?? ''
			}
		});
	}

	// --- Edges (no markerEnd — visual-only, not needed in canvas_state) ---
	const edges: CanvasEdge[] = [];
	let skippedEdges = 0;

	for (const flow of rawDataFlow) {
		const from = flow.from as string | undefined;
		const to = flow.to as string | undefined;

		if (!from || !to || !seenIds.has(from) || !seenIds.has(to)) {
			skippedEdges++;
			continue;
		}

		const edgeData: Record<string, unknown> = {
			edgeType: validEdgeType(flow.edgeType as string)
		};
		if (flow.label) {
			edgeData.label = flow.label as string;
		}

		edges.push({
			id: crypto.randomUUID(),
			source: from,
			target: to,
			type: 'typed',
			data: edgeData
		});
	}

	// --- Screens (import metadata + auto-create screen nodes) ---
	const screens: Screen[] = [];
	const rawScreens = (spec.screens as Record<string, unknown>[]) ?? [];
	let screenOffsetY = 50;
	for (const rawSc of rawScreens) {
		const screenId = (rawSc.id as string) ?? crypto.randomUUID();
		const rawRegions = Array.isArray(rawSc.regions) ? (rawSc.regions as Record<string, unknown>[]) : [];

		const regions: ScreenRegion[] = rawRegions.map((r) => {
			const rawElements = Array.isArray(r.elements) ? (r.elements as Record<string, unknown>[]) : [];
			return {
				id: (r.id as string) ?? crypto.randomUUID(),
				label: r.label as string | undefined,
				position: {
					x: ((r.position as { x?: number })?.x ?? 10),
					y: ((r.position as { y?: number })?.y ?? 10)
				},
				size: {
					width: ((r.size as { width?: number })?.width ?? 20),
					height: ((r.size as { height?: number })?.height ?? 15)
				},
				elementIds: rawElements
					.map((el) => el.nodeId as string)
					.filter((eid) => seenIds.has(eid)),
				componentNodeId: (r.componentNodeId as string) || undefined
			};
		});

		const elementCount = regions.reduce((sum, r) => sum + r.elementIds.length, 0);

		screens.push({
			id: screenId,
			name: (rawSc.name as string) ?? 'Imported Screen',
			imageUrl: '',
			imageWidth: 1920,
			imageHeight: 1080,
			imageFilename: rawSc.imageFilename as string | undefined,
			regions
		});

		// Auto-create screen node on canvas
		const screenNodeId = crypto.randomUUID();
		nodes.push({
			id: screenNodeId,
			type: 'screen',
			position: { x: 50, y: screenOffsetY },
			data: {
				label: (rawSc.name as string) ?? 'Imported Screen',
				screenId,
				regionCount: regions.length,
				elementCount
			}
		});
		screenOffsetY += 160;
	}

	return {
		nodes,
		edges,
		screens,
		projectName,
		stats: {
			dataPoints: nodes.filter((n) => n.type === 'datapoint').length,
			components: nodes.filter((n) => n.type === 'component').length,
			transforms: nodes.filter((n) => n.type === 'transform').length,
			tables: nodes.filter((n) => n.type === 'table').length,
			edges: edges.length,
			skippedEdges,
			skippedNodes
		}
	};
}

// --- Validation helpers with defaults ---

const VALID_DATA_TYPES: Set<string> = new Set(['string', 'number', 'boolean', 'object', 'array']);
function validDataType(t: string | undefined): DataType {
	return t && VALID_DATA_TYPES.has(t) ? (t as DataType) : 'string';
}

const VALID_SOURCES: Set<string> = new Set(['captured', 'inferred']);
function validSource(s: string | undefined): SourceType {
	return s && VALID_SOURCES.has(s) ? (s as SourceType) : 'captured';
}

const VALID_LOGIC_TYPES: Set<string> = new Set(['formula', 'validation', 'workflow']);
function validLogicType(t: string | undefined): LogicType {
	return t && VALID_LOGIC_TYPES.has(t) ? (t as LogicType) : 'formula';
}

const VALID_LOGIC_CONTENT_TYPES: Set<string> = new Set(['formula', 'decision_table', 'steps']);
function validLogicContentType(t: string | undefined): 'formula' | 'decision_table' | 'steps' {
	return t && VALID_LOGIC_CONTENT_TYPES.has(t)
		? (t as 'formula' | 'decision_table' | 'steps')
		: 'formula';
}

const VALID_TABLE_SOURCE_TYPES: Set<string> = new Set(['database', 'api', 'file', 'manual']);
function validTableSourceType(t: string | undefined): TableSourceType {
	return t && VALID_TABLE_SOURCE_TYPES.has(t) ? (t as TableSourceType) : 'database';
}

const VALID_EDGE_TYPES: Set<string> = new Set([
	'flows-to',
	'derives-from',
	'transforms',
	'validates',
	'contains'
]);
function validEdgeType(t: string | undefined): EdgeType {
	return t && VALID_EDGE_TYPES.has(t) ? (t as EdgeType) : 'flows-to';
}

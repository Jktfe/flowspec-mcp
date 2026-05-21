import dagre from '@dagrejs/dagre';
import type { CanvasNode, CanvasEdge } from '../types.js';

export type LayoutDirection = 'TB' | 'BT' | 'LR' | 'RL';

interface AutoLayoutOptions {
	rankdir: LayoutDirection;
	pinnedNodeIds: Set<string>;
}

// Approximate dimensions by node type (width × height)
const NODE_DIMENSIONS: Record<string, { width: number; height: number }> = {
	datapoint: { width: 200, height: 100 },
	component: { width: 180, height: 90 },
	transform: { width: 165, height: 95 },
	table: { width: 200, height: 120 },
	screen: { width: 160, height: 130 }
};

const DEFAULT_DIMENSION = { width: 180, height: 90 };

/**
 * Compute new positions for nodes using dagre hierarchical layout.
 * Pure function — returns a Map of nodeId → {x, y} (top-left coords).
 *
 * - Image nodes are always excluded (wireframe backgrounds)
 * - Pinned nodes are excluded from dagre and keep current positions
 * - Disconnected nodes (no edges) are placed in a column to the right
 */
export function computeAutoLayout(
	nodes: CanvasNode[],
	edges: CanvasEdge[],
	options: AutoLayoutOptions
): Map<string, { x: number; y: number }> {
	const positions = new Map<string, { x: number; y: number }>();

	// Filter to layoutable nodes (not image, not pinned)
	const layoutableNodes = nodes.filter(
		(n) => n.type !== 'image' && !options.pinnedNodeIds.has(n.id)
	);

	if (layoutableNodes.length === 0) return positions;

	// Identify which nodes have edges connecting them
	const layoutableIds = new Set(layoutableNodes.map((n) => n.id));
	const relevantEdges = edges.filter(
		(e) => layoutableIds.has(e.source) && layoutableIds.has(e.target)
	);

	const connectedIds = new Set<string>();
	for (const edge of relevantEdges) {
		connectedIds.add(edge.source);
		connectedIds.add(edge.target);
	}

	const connectedNodes = layoutableNodes.filter((n) => connectedIds.has(n.id));
	const disconnectedNodes = layoutableNodes.filter((n) => !connectedIds.has(n.id));

	// Build dagre graph for connected nodes
	if (connectedNodes.length > 0) {
		const g = new dagre.graphlib.Graph();
		g.setGraph({
			rankdir: options.rankdir,
			nodesep: 80,
			ranksep: 120,
			marginx: 40,
			marginy: 40
		});
		g.setDefaultEdgeLabel(() => ({}));

		for (const node of connectedNodes) {
			const dim = NODE_DIMENSIONS[node.type ?? ''] ?? DEFAULT_DIMENSION;
			g.setNode(node.id, { width: dim.width, height: dim.height });
		}

		for (const edge of relevantEdges) {
			if (connectedIds.has(edge.source) && connectedIds.has(edge.target)) {
				g.setEdge(edge.source, edge.target);
			}
		}

		dagre.layout(g);

		// Convert dagre centre-based coords to top-left for @xyflow
		for (const node of connectedNodes) {
			const dagreNode = g.node(node.id);
			if (dagreNode) {
				const dim = NODE_DIMENSIONS[node.type ?? ''] ?? DEFAULT_DIMENSION;
				positions.set(node.id, {
					x: dagreNode.x - dim.width / 2,
					y: dagreNode.y - dim.height / 2
				});
			}
		}
	}

	// Place disconnected nodes in a column to the right of the main graph
	if (disconnectedNodes.length > 0) {
		let maxX = 0;
		for (const [, pos] of positions) {
			if (pos.x > maxX) maxX = pos.x;
		}
		const columnX = positions.size > 0 ? maxX + 300 : 0;
		let currentY = 40;

		for (const node of disconnectedNodes) {
			const dim = NODE_DIMENSIONS[node.type ?? ''] ?? DEFAULT_DIMENSION;
			positions.set(node.id, { x: columnX, y: currentY });
			currentY += dim.height + 40;
		}
	}

	return positions;
}

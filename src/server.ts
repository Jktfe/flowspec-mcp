import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { listProjectsSchema, handleListProjects } from './tools/listProjects.js';
import { getYamlSchema, handleGetYaml } from './tools/getYaml.js';
import { getProjectSchema, handleGetProject } from './tools/getProject.js';
import { searchNodesSchema, handleSearchNodes } from './tools/searchNodes.js';
import { getScreenContextSchema, handleGetScreenContext } from './tools/getScreenContext.js';
// v2 write tools
import { createProjectSchema, handleCreateProject } from './tools/createProject.js';
import { updateProjectSchema, handleUpdateProject } from './tools/updateProject.js';
import { deleteProjectSchema, handleDeleteProject } from './tools/deleteProject.js';
import { createNodeSchema, handleCreateNode } from './tools/createNode.js';
import { updateNodeSchema, handleUpdateNode } from './tools/updateNode.js';
import { deleteNodeSchema, handleDeleteNode } from './tools/deleteNode.js';
import { createEdgeSchema, handleCreateEdge } from './tools/createEdge.js';
import { deleteEdgeSchema, handleDeleteEdge } from './tools/deleteEdge.js';
import { analyseProjectSchema, handleAnalyseProject } from './tools/analyseProject.js';
// v3 write tools
import { importYamlSchema, handleImportYaml } from './tools/importYaml.js';
import { autoLayoutSchema, handleAutoLayout } from './tools/autoLayout.js';
import { uploadImageSchema, handleUploadImage } from './tools/uploadImage.js';
import { createScreenSchema, handleCreateScreen } from './tools/createScreen.js';
import { updateScreenSchema, handleUpdateScreen } from './tools/updateScreen.js';
import { deleteScreenSchema, handleDeleteScreen } from './tools/deleteScreen.js';
import { addRegionSchema, handleAddRegion } from './tools/addRegion.js';
import { updateRegionSchema, handleUpdateRegion } from './tools/updateRegion.js';
import { removeRegionSchema, handleRemoveRegion } from './tools/removeRegion.js';
import { updateEdgeSchema, handleUpdateEdge } from './tools/updateEdge.js';
import { cloneProjectSchema, handleCloneProject } from './tools/cloneProject.js';
import { MODE } from './config.js';

export function createServer() {
  const server = new McpServer({
    name: 'flowspec',
    version: '4.2.0',
  });

  // ─── Read tools ──────────────────────────────────────────────────

  server.tool(
    'flowspec_list_projects',
    'List all FlowSpec projects with names and dates',
    listProjectsSchema.shape,
    handleListProjects
  );

  server.tool(
    'flowspec_get_yaml',
    'Get the full YAML spec for a FlowSpec project (optimised for Claude Code consumption)',
    getYamlSchema.shape,
    handleGetYaml
  );

  server.tool(
    'flowspec_get_project',
    'Get project data (nodes, edges, screens) for a FlowSpec project',
    getProjectSchema.shape,
    handleGetProject
  );

  server.tool(
    'flowspec_search_nodes',
    'Search for nodes by label across all projects, optionally filtered by type',
    searchNodesSchema.shape,
    handleSearchNodes
  );

  server.tool(
    'flowspec_get_screen_context',
    'Get screen/region/element structure for a FlowSpec project (lightweight alternative to full YAML)',
    getScreenContextSchema.shape,
    handleGetScreenContext
  );

  // ─── Write tools (v2) ────────────────────────────────────────────

  server.tool(
    'flowspec_create_project',
    'Create a new FlowSpec project. Before building from a codebase, scan source files for @flowspec annotations (left by the codebase-indexer skill) to avoid re-discovering already-indexed elements.',
    createProjectSchema.shape,
    handleCreateProject
  );

  server.tool(
    'flowspec_update_project',
    'Update a project name or replace its entire canvas state',
    updateProjectSchema.shape,
    handleUpdateProject
  );

  server.tool(
    'flowspec_delete_project',
    'Delete a FlowSpec project',
    deleteProjectSchema.shape,
    handleDeleteProject
  );

  server.tool(
    'flowspec_create_node',
    'Add a node (datapoint, component, transform, or table) to a project. Check source files for @flowspec annotations first — they contain pre-indexed element definitions (e.g. // @flowspec dp-name: type, source, constraints).',
    createNodeSchema.shape,
    handleCreateNode
  );

  server.tool(
    'flowspec_update_node',
    'Update a node\'s data (label, type, constraints) or position',
    updateNodeSchema.shape,
    handleUpdateNode
  );

  server.tool(
    'flowspec_delete_node',
    'Remove a node and all its connected edges from a project',
    deleteNodeSchema.shape,
    handleDeleteNode
  );

  server.tool(
    'flowspec_create_edge',
    'Connect two nodes with an edge type (flows-to, derives-from, transforms, validates, contains)',
    createEdgeSchema.shape,
    handleCreateEdge
  );

  server.tool(
    'flowspec_delete_edge',
    'Remove an edge from a project',
    deleteEdgeSchema.shape,
    handleDeleteEdge
  );

  server.tool(
    'flowspec_analyse_project',
    'Run orphan node and duplicate label analysis on a project',
    analyseProjectSchema.shape,
    handleAnalyseProject
  );

  // ─── Write tools (v3) ────────────────────────────────────────────

  server.tool(
    'flowspec_import_yaml',
    'Import specification to create/merge nodes, edges, and screens. If the codebase has @flowspec annotations, incorporate them into the spec before importing to avoid duplicating pre-indexed elements.',
    importYamlSchema.shape,
    handleImportYaml
  );

  server.tool(
    'flowspec_auto_layout',
    'Apply automatic hierarchical layout (Dagre) to organize nodes',
    autoLayoutSchema.shape,
    handleAutoLayout
  );

  server.tool(
    'flowspec_upload_image',
    'Upload an image and get its URL with auto-detected dimensions',
    uploadImageSchema.shape,
    handleUploadImage
  );

  server.tool(
    'flowspec_create_screen',
    'Create a new wireframe screen with optional image',
    createScreenSchema.shape,
    handleCreateScreen
  );

  server.tool(
    'flowspec_update_screen',
    'Update screen properties (name, image)',
    updateScreenSchema.shape,
    handleUpdateScreen
  );

  server.tool(
    'flowspec_delete_screen',
    'Delete a wireframe screen and all its regions',
    deleteScreenSchema.shape,
    handleDeleteScreen
  );

  server.tool(
    'flowspec_add_region',
    'Add a region to a screen with % coordinates and element IDs',
    addRegionSchema.shape,
    handleAddRegion
  );

  server.tool(
    'flowspec_update_region',
    'Update region position, size, label, or element IDs',
    updateRegionSchema.shape,
    handleUpdateRegion
  );

  server.tool(
    'flowspec_remove_region',
    'Remove a region from a screen',
    removeRegionSchema.shape,
    handleRemoveRegion
  );

  server.tool(
    'flowspec_update_edge',
    'Update edge type, label, or handle positions',
    updateEdgeSchema.shape,
    handleUpdateEdge
  );

  server.tool(
    'flowspec_clone_project',
    'Clone a project for backup or branching',
    cloneProjectSchema.shape,
    handleCloneProject
  );

  console.error(`FlowSpec MCP v4.2.0 — mode: ${MODE}`);

  return server;
}

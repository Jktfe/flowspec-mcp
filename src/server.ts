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
import { MODE } from './config.js';

export function createServer() {
  const server = new McpServer({
    name: 'flowspec',
    version: '2.0.0',
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
    'Get raw canvas_state JSON for a FlowSpec project',
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
    'Create a new FlowSpec project with a name and optional initial canvas state',
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
    'Add a node (datapoint, component, transform, or table) to a project',
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

  console.error(`FlowSpec MCP v2.0.0 — mode: ${MODE}`);

  return server;
}

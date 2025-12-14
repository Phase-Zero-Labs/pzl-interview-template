// Hamilton graph data types
export interface HamiltonNode {
  id: string;
  module: string;
  full_module: string;
  source: 'production' | 'sandbox';
  is_notebook: boolean;
  notebook_path: string | null;
  module_info: {
    color: string;
    order: number;
  };
  return_type: string;
  doc: string;
  dependencies: string[];
  tags: { label: string; color: string }[];
  dep_count: number;
  depth: number;
}

export interface HamiltonLink {
  source: string;
  target: string;
}

export interface HamiltonGraph {
  nodes: HamiltonNode[];
  links: HamiltonLink[];
  modules: Record<string, { color: string; order: number }>;
  module_order: string[];
  max_depth: number;
  title: string;
  project: string;
}

// React Flow node data
// Index signature required to satisfy React Flow's Record<string, unknown> constraint
export interface PipelineNodeData {
  [key: string]: unknown;
  label: string;
  module: string;
  fullModule: string;
  source: 'production' | 'sandbox';
  isNotebook: boolean;
  notebookPath: string | null;
  moduleColor: string;
  returnType: string;
  doc: string;
  tags: { label: string; color: string }[];
  dependencies: string[];
  isSource: boolean;
  isSink: boolean;
  isHighlighted: boolean;
  isDimmed: boolean;
  // Status indicators
  hasCachedData?: boolean;
  hasVisualizations?: boolean;
  visualizationCount?: number;
  historyCount?: number;
}

// Node status from /api/status endpoint
export interface NodeStatus {
  hasCachedData: boolean;
  hasVisualizations: boolean;
  vizCount: number;
}

export interface NodeStatusMap {
  [nodeId: string]: NodeStatus;
}

import { useCallback, useEffect, useState, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import PipelineNode from './PipelineNode';
import DataCatalog from './DataCatalog';
import NodeHistoryModal from './NodeHistoryModal';
import { getLayoutedElements, findUpstream } from './layout';
import { useHistoryCounts } from './hooks/useJobHistory';
import { useJobStream, formatDuration } from './hooks/useJobStream';
import type { HamiltonGraph, HamiltonNode, PipelineNodeData, NodeStatusMap } from './types';
import './App.css';

// Generate LLM-friendly text representation of nodes
function generateDAGText(nodes: HamiltonNode[]): string {
  const lines: string[] = [];
  lines.push('# Hamilton DAG Export');
  lines.push(`# ${nodes.length} nodes`);
  lines.push('');

  // Group by module
  const byModule: Record<string, HamiltonNode[]> = {};
  for (const node of nodes) {
    const mod = node.module || 'unknown';
    if (!byModule[mod]) byModule[mod] = [];
    byModule[mod].push(node);
  }

  for (const [module, moduleNodes] of Object.entries(byModule)) {
    lines.push(`## Module: ${module}`);
    lines.push('');

    for (const node of moduleNodes) {
      lines.push(`### ${node.id}`);
      lines.push(`- **Returns**: ${node.return_type}`);
      lines.push(`- **Dependencies**: ${node.dependencies.length > 0 ? node.dependencies.join(', ') : 'None (source node)'}`);
      if (node.doc) {
        lines.push(`- **Description**: ${node.doc}`);
      }
      if (node.tags.length > 0) {
        lines.push(`- **Tags**: ${node.tags.map(t => t.label).join(', ')}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nodeTypes = { pipeline: PipelineNode } as any;

const API_URL = '/api/graph';

// Format cell values for display in preview table
function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '-';
  }
  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return value.toLocaleString();
    }
    return value.toFixed(4);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'object') {
    const str = JSON.stringify(value);
    return str.length > 50 ? str.slice(0, 47) + '...' : str;
  }
  const str = String(value);
  return str.length > 100 ? str.slice(0, 97) + '...' : str;
}

interface Visualizations {
  images: string[];
  parquets: string[];
  totalAvailable?: number;
}

interface DataFramePreview {
  data: Record<string, unknown>[];
  columns: string[];
  dtypes: Record<string, string>;
  shape: [number, number];
  nodeType: string;
  cached: boolean;
  cachePath?: string;
  error?: string;
}

interface SourceCodeInfo {
  code: string;
  module: string;
  file: string;
  lineNumber: number;
  error?: string;
}

function AppInner() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<PipelineNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [graph, setGraph] = useState<HamiltonGraph | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visualizations, setVisualizations] = useState<Visualizations | null>(null);
  const [loadingViz, setLoadingViz] = useState(false);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const [showJobModal, setShowJobModal] = useState(false);
  const [dataPreview, setDataPreview] = useState<DataFramePreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [showDocsModal, setShowDocsModal] = useState(false);
  const [sourceCode, setSourceCode] = useState<SourceCodeInfo | null>(null);
  const [loadingCode, setLoadingCode] = useState(false);
  const [showCodeSection, setShowCodeSection] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyNodeId, setHistoryNodeId] = useState<string | null>(null);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [jobModalMinimized, setJobModalMinimized] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  // History counts for node badges
  const { counts: historyCounts, refresh: refreshHistoryCounts } = useHistoryCounts();

  // SSE job streaming
  const jobStream = useJobStream(currentJobId, {
    onComplete: () => {
      refreshHistoryCounts();
      refreshStatus(); // Also refresh cache/viz status after job completion
    },
  });

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedModules, setSelectedModules] = useState<Set<string>>(new Set());

  const reactFlowInstance = useReactFlow();

  // Get unique modules from graph
  const modules = useMemo(() => {
    if (!graph) return [];
    const moduleSet = new Set<string>();
    graph.nodes.forEach(n => moduleSet.add(n.module));
    return Array.from(moduleSet).sort();
  }, [graph]);

  // Get module colors
  const moduleColors = useMemo(() => {
    if (!graph) return {};
    const colors: Record<string, string> = {};
    graph.nodes.forEach(n => {
      if (n.module_info?.color) {
        colors[n.module] = n.module_info.color;
      }
    });
    return colors;
  }, [graph]);

  // Get highlighted node IDs for copy functionality (upstream dependencies of selected node)
  const highlightedNodeIds = useMemo(() => {
    if (!selectedNode || !graph) return new Set<string>();
    return findUpstream(selectedNode, graph.links);
  }, [selectedNode, graph]);

  // Copy DAG to clipboard
  const copyDAGToClipboard = useCallback(async () => {
    if (!graph) return;

    // Determine which nodes to copy
    const nodesToCopy = highlightedNodeIds.size > 0
      ? graph.nodes.filter(n => highlightedNodeIds.has(n.id))
      : graph.nodes;

    const text = generateDAGText(nodesToCopy);

    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback(highlightedNodeIds.size > 0
        ? `Copied ${nodesToCopy.length} nodes`
        : 'Copied full DAG');
      setTimeout(() => setCopyFeedback(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      setCopyFeedback('Copy failed');
      setTimeout(() => setCopyFeedback(null), 2000);
    }
  }, [graph, highlightedNodeIds]);

  // Filter nodes based on search, module, and source selection
  const filteredNodeIds = useMemo(() => {
    if (!graph) return new Set<string>();

    return new Set(
      graph.nodes
        .filter(n => {
          // Search filter
          if (searchQuery) {
            const q = searchQuery.toLowerCase();
            const matchesId = n.id.toLowerCase().includes(q);
            const matchesDoc = n.doc?.toLowerCase().includes(q);
            const matchesModule = n.module.toLowerCase().includes(q);
            if (!matchesId && !matchesDoc && !matchesModule) return false;
          }
          // Module filter
          if (selectedModules.size > 0 && !selectedModules.has(n.module)) {
            return false;
          }
          return true;
        })
        .map(n => n.id)
    );
  }, [graph, searchQuery, selectedModules]);

  // Apply visual filtering to nodes
  useEffect(() => {
    if (!graph || selectedNode) return; // Don't override selection highlighting

    setNodes(nds =>
      nds.map(n => ({
        ...n,
        data: {
          ...n.data,
          isDimmed: !filteredNodeIds.has(n.id),
          isHighlighted: false,
        },
      }))
    );
  }, [filteredNodeIds, graph, selectedNode, setNodes]);

  // Focus on matching nodes when search changes
  useEffect(() => {
    if (!searchQuery || filteredNodeIds.size === 0) return;

    // Find the first matching node and focus on it
    const firstMatch = nodes.find(n => filteredNodeIds.has(n.id));
    if (firstMatch && reactFlowInstance) {
      reactFlowInstance.setCenter(
        firstMatch.position.x + 140,
        firstMatch.position.y + 50,
        { zoom: 1, duration: 300 }
      );
    }
  }, [searchQuery, filteredNodeIds, nodes, reactFlowInstance]);

  // Refresh just the status data (cache/viz indicators)
  const refreshStatus = useCallback(async () => {
    try {
      const statusRes = await fetch('/api/status');
      if (!statusRes.ok) return;

      const statusData = await statusRes.json();
      const statusMap: NodeStatusMap = statusData.statuses || {};

      setNodes(nds =>
        nds.map(node => {
          const status = statusMap[node.id];
          return {
            ...node,
            data: {
              ...node.data,
              hasCachedData: status?.hasCachedData || false,
              hasVisualizations: status?.hasVisualizations || false,
              visualizationCount: status?.vizCount || 0,
            },
          };
        })
      );
    } catch (e) {
      console.warn('Failed to refresh status:', e);
    }
  }, [setNodes]);

  // Load graph data and node statuses
  const loadGraph = useCallback(async () => {
    try {
      setLoading(true);
      const [graphRes, statusRes] = await Promise.all([
        fetch(API_URL),
        fetch('/api/status'),
      ]);

      if (!graphRes.ok) throw new Error('Failed to fetch graph');
      const data: HamiltonGraph = await graphRes.json();
      setGraph(data);

      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(data);

      // Merge status data into nodes if available
      let statusMap: NodeStatusMap = {};
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        statusMap = statusData.statuses || {};
      }

      // Fetch history counts
      let historyCountsData: Record<string, number> = {};
      try {
        const historyRes = await fetch('/api/history/counts');
        if (historyRes.ok) {
          historyCountsData = await historyRes.json();
        }
      } catch (e) {
        console.warn('Failed to fetch history counts:', e);
      }

      // Apply status and history counts to each node
      const nodesWithStatus = layoutedNodes.map(node => {
        const status = statusMap[node.id];
        return {
          ...node,
          data: {
            ...node.data,
            hasCachedData: status?.hasCachedData || false,
            hasVisualizations: status?.hasVisualizations || false,
            visualizationCount: status?.vizCount || 0,
            historyCount: historyCountsData[node.id] || 0,
          },
        };
      });

      setNodes(nodesWithStatus);
      setEdges(layoutedEdges);

      setLoading(false);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      setLoading(false);
    }
  }, [setNodes, setEdges]);

  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  // Run pipeline for a node (now uses SSE streaming)
  const runNode = useCallback(async (nodeId: string) => {
    try {
      const response = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outputs: [nodeId], nodeId }),
      });

      if (!response.ok) throw new Error('Failed to start pipeline');

      const data = await response.json();
      // Set job ID to trigger SSE streaming via useJobStream hook
      setCurrentJobId(data.jobId);
      setShowJobModal(true);
    } catch (e) {
      console.error('Failed to run pipeline:', e);
    }
  }, []);

  // Open history modal for a node
  const openHistory = useCallback((nodeId: string) => {
    setHistoryNodeId(nodeId);
    setShowHistoryModal(true);
  }, []);

  // Fetch visualizations for a node
  const fetchVisualizations = useCallback(async (nodeId: string) => {
    setLoadingViz(true);
    setVisualizations(null);
    try {
      const response = await fetch(`/api/visualizations/${encodeURIComponent(nodeId)}`);
      if (response.ok) {
        const data = await response.json();
        setVisualizations(data);
      }
    } catch (e) {
      console.error('Failed to fetch visualizations:', e);
    } finally {
      setLoadingViz(false);
    }
  }, []);

  // Fetch DataFrame preview for a node (for sidebar - small limit)
  const fetchPreview = useCallback(async (nodeId: string, limit: number = 5) => {
    setLoadingPreview(true);
    setDataPreview(null);
    try {
      const response = await fetch(`/api/preview/${encodeURIComponent(nodeId)}?limit=${limit}`);
      if (response.ok) {
        const data = await response.json();
        setDataPreview(data);
      }
    } catch (e) {
      console.error('Failed to fetch preview:', e);
      setDataPreview({ error: 'Failed to fetch preview', data: [], columns: [], dtypes: {}, shape: [0, 0], nodeType: 'unknown', cached: false });
    } finally {
      setLoadingPreview(false);
    }
  }, []);

  // Fetch source code for a node
  const fetchSourceCode = useCallback(async (nodeId: string) => {
    setLoadingCode(true);
    setSourceCode(null);
    try {
      const response = await fetch(`/api/code/${encodeURIComponent(nodeId)}`);
      if (response.ok) {
        const data = await response.json();
        setSourceCode(data);
      }
    } catch (e) {
      console.error('Failed to fetch source code:', e);
      setSourceCode({ code: '', module: '', file: '', lineNumber: 0, error: 'Failed to fetch source code' });
    } finally {
      setLoadingCode(false);
    }
  }, []);

  // Handle node click - highlight upstream dependencies
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (!graph) return;

      const nodeId = node.id;
      setSelectedNode(nodeId);
      fetchVisualizations(nodeId);
      fetchPreview(nodeId);

      const upstream = findUpstream(nodeId, graph.links);

      // Update node styles - highlight upstream
      setNodes(nds =>
        nds.map(n => ({
          ...n,
          data: {
            ...n.data,
            isHighlighted: upstream.has(n.id),
            isDimmed: !upstream.has(n.id),
          },
        }))
      );

      // Update edge styles
      setEdges(eds =>
        eds.map(e => {
          const isInUpstream = upstream.has(e.source) && upstream.has(e.target);
          return {
            ...e,
            animated: isInUpstream,
            style: {
              stroke: isInUpstream ? '#0D9488' : '#E2E8F0',
              strokeWidth: isInUpstream ? 2 : 1.5,
              opacity: isInUpstream ? 1 : 0.3,
            },
          };
        })
      );
    },
    [graph, setNodes, setEdges, fetchVisualizations, fetchPreview]
  );

  // Reset on background click
  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setVisualizations(null);
    setExpandedImage(null);
    setDataPreview(null);
    setNodes(nds =>
      nds.map(n => ({
        ...n,
        data: { ...n.data, isHighlighted: false, isDimmed: false },
      }))
    );
    setEdges(eds =>
      eds.map(e => ({
        ...e,
        animated: false,
        style: { stroke: '#9ca3af', strokeWidth: 2, opacity: 1 },
      }))
    );
  }, [setNodes, setEdges]);

  // Get selected node data for panel
  const selectedNodeData = selectedNode
    ? graph?.nodes.find(n => n.id === selectedNode)
    : null;

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <p>Loading pipeline...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error">
        <h2>Error loading graph</h2>
        <p>{error}</p>
        <p>Make sure the API server is running on port 5050</p>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <div className="logo">
          <div className="logo-mark">Hm</div>
          <span>Hamilton</span>
        </div>

        <div className="search-container">
          <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            className="search-input"
            placeholder="Search nodes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="search-clear" onClick={() => setSearchQuery('')}>
              &times;
            </button>
          )}
          {searchQuery && (
            <span className="search-count">{filteredNodeIds.size}</span>
          )}
        </div>

        <div className="header-actions">
          <button className="refresh-btn" onClick={refreshStatus} title="Refresh cache status">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 16h5v5" />
            </svg>
          </button>
          <button className="docs-btn" onClick={() => setShowDocsModal(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
            Docs
          </button>
          <button className="catalog-btn" onClick={() => setShowCatalogModal(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
            </svg>
            Catalog
          </button>
          <button
            className="copy-dag-btn"
            onClick={copyDAGToClipboard}
            title={highlightedNodeIds.size > 0
              ? `Copy ${highlightedNodeIds.size} selected nodes to clipboard`
              : 'Copy full DAG to clipboard'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            {highlightedNodeIds.size > 0
              ? `Copy (${highlightedNodeIds.size})`
              : 'Copy DAG'}
          </button>
          {copyFeedback && (
            <span className="copy-feedback">{copyFeedback}</span>
          )}
        </div>
      </header>

      {/* Module Filter Chips */}
      {modules.length > 0 && (
        <div className="module-filters">
          <button
            className={`module-chip ${selectedModules.size === 0 ? 'active' : ''}`}
            onClick={() => setSelectedModules(new Set())}
          >
            All
          </button>
          {modules.map(mod => (
            <button
              key={mod}
              className={`module-chip ${selectedModules.has(mod) ? 'active' : ''}`}
              onClick={() => {
                const newSelected = new Set(selectedModules);
                if (newSelected.has(mod)) {
                  newSelected.delete(mod);
                } else {
                  newSelected.add(mod);
                }
                setSelectedModules(newSelected);
              }}
            >
              <span className="dot" style={{ backgroundColor: moduleColors[mod] || '#94A3B8' }} />
              {mod}
            </button>
          ))}
        </div>
      )}

      <div className="main">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.1}
          maxZoom={2}
          defaultEdgeOptions={{
            type: 'smoothstep',
          }}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#e5e7eb" gap={24} />
          <Controls />
        </ReactFlow>

        {selectedNodeData && (
          <div className="panel">
            <div className="panel-header">
              <h3>{selectedNodeData.id}</h3>
              <button onClick={onPaneClick} className="close-btn">
                &times;
              </button>
            </div>
            <div className="panel-content">
              {/* Run & History Buttons */}
              <section className="run-section">
                <button
                  className="run-btn"
                  onClick={() => runNode(selectedNodeData.id)}
                  disabled={currentJobId !== null && (jobStream.status === 'running' || jobStream.status === 'connecting')}
                >
                  {currentJobId && (jobStream.status === 'running' || jobStream.status === 'connecting') ? 'Running...' : 'Run This Node'}
                </button>
                {historyCounts[selectedNodeData.id] > 0 && (
                  <button
                    className="history-btn"
                    onClick={() => openHistory(selectedNodeData.id)}
                  >
                    History ({historyCounts[selectedNodeData.id]})
                  </button>
                )}
              </section>

              <section>
                <h4>Overview</h4>
                <div className="info-grid">
                  <div className="info-item">
                    <span className="label">Module</span>
                    <span
                      className="value"
                      style={{ color: selectedNodeData.module_info?.color }}
                    >
                      {selectedNodeData.module}
                    </span>
                  </div>
                  <div className="info-item">
                    <span className="label">Source</span>
                    <span className={`value source-indicator ${selectedNodeData.source}`}>
                      {selectedNodeData.source === 'sandbox' ? 'Sandbox' : 'Production'}
                    </span>
                  </div>
                  <div className="info-item">
                    <span className="label">Returns</span>
                    <span className="value">{selectedNodeData.return_type}</span>
                  </div>
                  <div className="info-item">
                    <span className="label">Inputs</span>
                    <span className="value">{selectedNodeData.dependencies.length}</span>
                  </div>
                  <div className="info-item">
                    <span className="label">Layer</span>
                    <span className="value">{selectedNodeData.depth}</span>
                  </div>
                </div>
              </section>

              {selectedNodeData.tags.length > 0 && (
                <section>
                  <h4>Tags</h4>
                  <div className="tags">
                    {selectedNodeData.tags.map((tag, i) => (
                      <span
                        key={i}
                        className="tag"
                        style={{ backgroundColor: tag.color }}
                      >
                        {tag.label}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {selectedNodeData.dependencies.length > 0 && (
                <section>
                  <h4>Dependencies</h4>
                  <div className="dep-list">
                    {selectedNodeData.dependencies.map(dep => (
                      <button
                        key={dep}
                        className="dep-item"
                        onClick={() => {
                          const node = nodes.find(n => n.id === dep);
                          if (node) onNodeClick({} as React.MouseEvent, node);
                        }}
                      >
                        <span className="arrow">&larr;</span>
                        {dep}
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {selectedNodeData.doc && (
                <section>
                  <h4>Documentation</h4>
                  <p className="doc">{selectedNodeData.doc}</p>
                </section>
              )}

              {/* Source Code Section */}
              <section>
                <h4>
                  Source Code
                  <button
                    className="code-toggle-btn"
                    onClick={() => {
                      if (!showCodeSection && !sourceCode) {
                        fetchSourceCode(selectedNodeData.id);
                      }
                      setShowCodeSection(!showCodeSection);
                    }}
                  >
                    {showCodeSection ? 'Hide' : 'Show'}
                  </button>
                </h4>
                {showCodeSection && (
                  <div className="code-section">
                    {loadingCode ? (
                      <div className="code-loading">Loading source code...</div>
                    ) : sourceCode?.error ? (
                      <div className="code-error">{sourceCode.error}</div>
                    ) : sourceCode?.code ? (
                      <>
                        <div className="code-meta">
                          <span className="code-file" title={sourceCode.file}>
                            {sourceCode.file.split('/').slice(-2).join('/')}:{sourceCode.lineNumber}
                          </span>
                        </div>
                        <pre className="code-block">
                          <code>{sourceCode.code}</code>
                        </pre>
                      </>
                    ) : (
                      <div className="code-empty">Click "Show" to load source code</div>
                    )}
                  </div>
                )}
              </section>

              {/* Data Preview Section */}
              <section>
                <h4>
                  Data Preview
                  {dataPreview?.cached && dataPreview.shape && (
                    <span className="data-shape">{dataPreview.shape[0].toLocaleString()} x {dataPreview.shape[1]}</span>
                  )}
                </h4>
                {loadingPreview ? (
                  <div className="data-preview-loading">Loading data...</div>
                ) : dataPreview?.cached && dataPreview.data.length > 0 ? (
                  <div
                    className="data-preview-mini"
                    onClick={() => setShowPreviewModal(true)}
                    title="Click to expand"
                  >
                    <table className="data-preview-table">
                      <thead>
                        <tr>
                          {dataPreview.columns.slice(0, 4).map((col, i) => (
                            <th key={i}>{col.length > 12 ? col.slice(0, 10) + '..' : col}</th>
                          ))}
                          {dataPreview.columns.length > 4 && <th>...</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {dataPreview.data.slice(0, 3).map((row, rowIdx) => (
                          <tr key={rowIdx}>
                            {dataPreview.columns.slice(0, 4).map((col, colIdx) => (
                              <td key={colIdx}>{formatCellValue(row[col])}</td>
                            ))}
                            {dataPreview.columns.length > 4 && <td>...</td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="data-preview-hint">Click to expand</div>
                  </div>
                ) : (
                  <p className="data-empty">No cached data found for this node</p>
                )}
              </section>

              {/* Visualizations Section */}
              <section>
                <h4>
                  Visualizations
                  {visualizations && visualizations.totalAvailable && visualizations.totalAvailable > visualizations.images.length && (
                    <span className="viz-count"> ({visualizations.images.length} of {visualizations.totalAvailable})</span>
                  )}
                </h4>
                {loadingViz ? (
                  <div className="viz-loading">Loading visualizations...</div>
                ) : visualizations && visualizations.images.length > 0 ? (
                  <div className="viz-gallery">
                    {visualizations.images.map((img, i) => {
                      const filename = img.split('/').pop() || img;
                      // Extract drug name from path like /Sandbox/results/3d_feature_visualization/Abemaciclib/dose_response/...
                      const pathParts = img.split('/');
                      const drugIdx = pathParts.findIndex(p => p === '3d_feature_visualization');
                      const drugName = drugIdx >= 0 && pathParts[drugIdx + 1] ? pathParts[drugIdx + 1] : '';
                      return (
                        <div
                          key={i}
                          className="viz-item"
                          onClick={() => setExpandedImage(img)}
                          title={drugName ? `${drugName}: ${filename}` : filename}
                        >
                          <img
                            src={`/static${img}`}
                            alt={filename}
                            loading="lazy"
                          />
                          <span className="viz-filename">
                            {drugName ? `${drugName.slice(0, 12)}${drugName.length > 12 ? '...' : ''}` : filename}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="viz-empty">No visualizations found for this node</p>
                )}
              </section>
            </div>
          </div>
        )}

        {/* Expanded Image Modal */}
        {expandedImage && (
          <div className="image-modal" onClick={() => setExpandedImage(null)}>
            <div className="image-modal-content" onClick={e => e.stopPropagation()}>
              <button className="close-modal" onClick={() => setExpandedImage(null)}>
                &times;
              </button>
              <img src={`/static${expandedImage}`} alt="Expanded visualization" />
              <p className="image-path">{expandedImage}</p>
            </div>
          </div>
        )}

        {/* Job Progress Modal - Now uses SSE streaming */}
        {showJobModal && currentJobId && jobStream.status !== 'idle' && !jobModalMinimized && (
          <div className="job-modal" onClick={() => jobStream.status !== 'running' && jobStream.status !== 'connecting' && (setShowJobModal(false), setCurrentJobId(null))}>
            <div className="job-modal-content" onClick={e => e.stopPropagation()}>
              <div className="job-modal-header">
                <h3>Pipeline Execution</h3>
                <div className="job-modal-actions">
                  <div className={`job-status job-status-${jobStream.status}`}>
                    {(jobStream.status === 'running' || jobStream.status === 'connecting') && <div className="spinner-small" />}
                    {jobStream.status}
                  </div>
                  <button
                    className="job-minimize-btn"
                    onClick={() => setJobModalMinimized(true)}
                    title="Minimize"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 12h14" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="job-elapsed">
                Elapsed: {jobStream.startTime ? formatDuration(Date.now() - jobStream.startTime) : '--'}
                {jobStream.duration && ` (Total: ${formatDuration(jobStream.duration)})`}
              </div>
              <div className="job-output">
                {jobStream.logs.map((log) => (
                  <div key={log.id} className={`job-line ${log.stream === 'stderr' ? 'stderr' : ''}`}>
                    {log.line}
                  </div>
                ))}
              </div>
              {jobStream.status !== 'running' && jobStream.status !== 'connecting' && (
                <button className="job-close-btn" onClick={() => { setShowJobModal(false); setCurrentJobId(null); }}>
                  Close
                </button>
              )}
            </div>
          </div>
        )}

        {/* Minimized Job Indicator */}
        {showJobModal && currentJobId && jobStream.status !== 'idle' && jobModalMinimized && (
          <div
            className={`job-minimized job-minimized-${jobStream.status}`}
            onClick={() => setJobModalMinimized(false)}
          >
            {(jobStream.status === 'running' || jobStream.status === 'connecting') && <div className="spinner-small" />}
            <span className="job-minimized-label">
              {jobStream.status === 'running' || jobStream.status === 'connecting' ? 'Running' : jobStream.status}
            </span>
            <span className="job-minimized-time">
              {jobStream.startTime ? formatDuration(Date.now() - jobStream.startTime) : '--'}
            </span>
            {jobStream.status !== 'running' && jobStream.status !== 'connecting' && (
              <button
                className="job-minimized-close"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowJobModal(false);
                  setCurrentJobId(null);
                  setJobModalMinimized(false);
                }}
              >
                &times;
              </button>
            )}
          </div>
        )}

        {/* Node History Modal */}
        {showHistoryModal && historyNodeId && (
          <NodeHistoryModal
            nodeId={historyNodeId}
            onClose={() => {
              setShowHistoryModal(false);
              setHistoryNodeId(null);
            }}
          />
        )}

        {/* DataFrame Preview Modal */}
        {showPreviewModal && (
          <div className="preview-modal" onClick={() => setShowPreviewModal(false)}>
            <div className="preview-modal-content" onClick={e => e.stopPropagation()}>
              <div className="preview-modal-header">
                <h3>Data Preview: {selectedNode}</h3>
                <button className="close-modal" onClick={() => setShowPreviewModal(false)}>
                  &times;
                </button>
              </div>
              {loadingPreview ? (
                <div className="preview-loading">
                  <div className="spinner" />
                  <p>Checking for cached data...</p>
                </div>
              ) : dataPreview && !dataPreview.cached && dataPreview.error ? (
                <div className="preview-not-cached">
                  <div className="not-cached-icon">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25" />
                      <path d="M8 16h.01" />
                      <path d="M8 20h.01" />
                      <path d="M12 18h.01" />
                      <path d="M12 22h.01" />
                      <path d="M16 16h.01" />
                      <path d="M16 20h.01" />
                    </svg>
                  </div>
                  <p className="not-cached-title">No Cached Data</p>
                  <p className="not-cached-message">
                    This node hasn't been run yet. Click "Run This Node" to generate data, then preview again.
                  </p>
                  <button
                    className="run-to-preview-btn"
                    onClick={() => {
                      setShowPreviewModal(false);
                      if (selectedNode) runNode(selectedNode);
                    }}
                  >
                    Run Node
                  </button>
                </div>
              ) : dataPreview?.error ? (
                <div className="preview-error">
                  <p className="error-title">Error loading preview</p>
                  <p className="error-message">{dataPreview.error}</p>
                </div>
              ) : dataPreview && dataPreview.data.length > 0 ? (
                <>
                  <div className="preview-stats">
                    <span>Shape: {dataPreview.shape[0].toLocaleString()} rows x {dataPreview.shape[1]} columns</span>
                    <span>Type: {dataPreview.nodeType}</span>
                    <span>Showing: {dataPreview.data.length} rows</span>
                    {dataPreview.cachePath && (
                      <span className="cache-path" title={dataPreview.cachePath}>
                        Cached: {dataPreview.cachePath.split('/').pop()}
                      </span>
                    )}
                  </div>
                  <div className="preview-table-container">
                    <table className="preview-table">
                      <thead>
                        <tr>
                          {dataPreview.columns.map((col, i) => (
                            <th key={i}>
                              <div className="col-name">{col}</div>
                              <div className="col-dtype">{dataPreview.dtypes[col]}</div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {dataPreview.data.map((row, rowIdx) => (
                          <tr key={rowIdx}>
                            {dataPreview.columns.map((col, colIdx) => (
                              <td key={colIdx}>
                                {formatCellValue(row[col])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="preview-empty">
                  <p>No data available for this node</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Documentation Modal */}
        {showDocsModal && (
          <div className="docs-modal" onClick={() => setShowDocsModal(false)}>
            <div className="docs-modal-content" onClick={e => e.stopPropagation()}>
              <div className="docs-header">
                <div className="docs-title">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                  </svg>
                  <h2>Hamilton Pipeline Guide</h2>
                </div>
                <button className="close-modal" onClick={() => setShowDocsModal(false)}>&times;</button>
              </div>

              <div className="docs-body">
                <nav className="docs-nav">
                  <a href="#overview">Overview</a>
                  <a href="#hamilton">How It Works</a>
                  <a href="#tags">Tags</a>
                  <a href="#structure">Structure</a>
                  <a href="#visualization">Visualizations</a>
                  <a href="#running">Running</a>
                </nav>

                <div className="docs-content">
                  <section id="overview">
                    <h3>Hamilton Pipeline Template</h3>
                    <p>
                      Write Python functions, get a data pipeline. Hamilton turns your functions into a
                      directed acyclic graph (DAG) automatically.
                    </p>
                    <div className="docs-callout">
                      <strong>Philosophy:</strong>
                      <ul>
                        <li>Any function in <code>scripts/*.py</code> becomes a node</li>
                        <li>Add metadata progressively for more features</li>
                        <li>Everything is optional - start simple</li>
                      </ul>
                    </div>
                  </section>

                  <section id="hamilton">
                    <h3>How Hamilton Works</h3>
                    <p>
                      <strong>Functions become nodes.</strong> The function name becomes the node ID.
                    </p>
                    <p>
                      <strong>Edges are created by parameter names.</strong> When a parameter name matches
                      another function's name, Hamilton creates a dependency edge.
                    </p>
                    <pre>{`def raw_data() -> pd.DataFrame:
    """This function's name is 'raw_data'."""
    return pd.read_csv("data/input.csv")

def processed_data(raw_data: pd.DataFrame) -> pd.DataFrame:
    """Parameter 'raw_data' matches function above.
    Edge created: raw_data -> processed_data"""
    return raw_data.dropna()`}</pre>
                    <p className="docs-tip">
                      Type hints add validation but aren't required for edges. The edge comes from the parameter name alone.
                    </p>
                  </section>

                  <section id="tags">
                    <h3>Available Tags</h3>
                    <p>Add tags in docstrings for progressive enhancement:</p>
                    <div className="docs-code-block">
                      <pre>{`def my_node(input: pd.DataFrame) -> pd.DataFrame:
    """
    Description here.

    @asset                    # Data catalog entry
    @asset: custom_name       # Named catalog entry
    @location: data/out/      # Output location hint
    @viz_output: results/fig/ # Visualization folder
    @ignore                   # Hide from UI
    @tag: critical            # Custom tag (gray)
    @tag: wip #ff6b6b         # Custom tag with color
    """`}</pre>
                    </div>
                    <p>Keywords like "database", "plot", "parquet" auto-detect tags too.</p>
                  </section>

                  <section id="structure">
                    <h3>Project Structure</h3>
                    <div className="docs-grid">
                      <div className="docs-grid-item">
                        <h4>scripts/</h4>
                        <p>Your Hamilton modules. Any .py file here becomes part of the DAG.</p>
                      </div>
                      <div className="docs-grid-item">
                        <h4>scripts/utils/</h4>
                        <p>Shared utilities - data sources, visualization helpers, common logic.</p>
                      </div>
                      <div className="docs-grid-item">
                        <h4>Sandbox/</h4>
                        <p>Experimental scripts and results. Code versioned, outputs gitignored.</p>
                      </div>
                      <div className="docs-grid-item">
                        <h4>data/ & results/</h4>
                        <p>Input data and pipeline outputs. Organize as you like.</p>
                      </div>
                    </div>
                  </section>

                  <section id="visualization">
                    <h3>Visualization Outputs</h3>
                    <p>Visualizations are auto-discovered. Two approaches:</p>

                    <div className="docs-code-block">
                      <h4>Convention</h4>
                      <p>Save to <code>Sandbox/results/{'<node_name>'}/ </code></p>
                      <pre>{`def my_charts(data: pd.DataFrame) -> Path:
    output_dir = Path("Sandbox/results/my_charts")
    output_dir.mkdir(parents=True, exist_ok=True)
    fig.savefig(output_dir / "chart.png")
    return output_dir`}</pre>
                    </div>

                    <div className="docs-code-block">
                      <h4>Explicit Tag</h4>
                      <pre>{`def custom_viz(data: pd.DataFrame) -> Path:
    """@viz_output: results/custom_folder"""`}</pre>
                    </div>
                  </section>

                  <section id="running">
                    <h3>Running Nodes</h3>
                    <div className="docs-methods">
                      <div className="docs-method">
                        <h4>From UI</h4>
                        <p>Click any node, then "Run This Node". All dependencies run automatically.</p>
                      </div>
                      <div className="docs-method">
                        <h4>From CLI</h4>
                        <pre>{`uv run python scripts/run.py --outputs my_node`}</pre>
                      </div>
                      <div className="docs-method">
                        <h4>Programmatically</h4>
                        <pre>{`from hamilton import driver
import scripts.my_module as my_module

dr = driver.Builder().with_modules(my_module).build()
result = dr.execute(['my_node'])`}</pre>
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Data Catalog Modal */}
        {showCatalogModal && (
          <DataCatalog onClose={() => setShowCatalogModal(false)} />
        )}
      </div>
    </div>
  );
}

// Wrap with ReactFlowProvider
function App() {
  return (
    <ReactFlowProvider>
      <AppInner />
    </ReactFlowProvider>
  );
}

export default App;

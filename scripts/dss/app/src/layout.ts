import dagre from 'dagre';
import type { Node, Edge } from '@xyflow/react';
import type { HamiltonGraph, PipelineNodeData } from './types';

const NODE_WIDTH = 200;
const NODE_HEIGHT = 70;

export function getLayoutedElements(
  graph: HamiltonGraph
): { nodes: Node<PipelineNodeData>[]; edges: Edge[] } {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  // Configure for left-to-right layout with comfortable spacing
  dagreGraph.setGraph({
    rankdir: 'LR',
    nodesep: 40,
    ranksep: 100,
    marginx: 30,
    marginy: 30,
  });

  // Check which nodes have dependents (are sources for other nodes)
  const hasDependent = new Set<string>();
  graph.links.forEach(link => hasDependent.add(link.source));

  // Add nodes to dagre
  graph.nodes.forEach(node => {
    dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  // Add edges to dagre
  graph.links.forEach(link => {
    dagreGraph.setEdge(link.source, link.target);
  });

  // Run layout
  dagre.layout(dagreGraph);

  // Convert to React Flow nodes
  const nodes: Node<PipelineNodeData>[] = graph.nodes.map(node => {
    const nodeWithPosition = dagreGraph.node(node.id);
    const isSource = node.dep_count === 0;
    const isSink = !hasDependent.has(node.id);

    return {
      id: node.id,
      type: 'pipeline',
      position: {
        x: nodeWithPosition.x - NODE_WIDTH / 2,
        y: nodeWithPosition.y - NODE_HEIGHT / 2,
      },
      data: {
        label: node.id,
        module: node.module,
        fullModule: node.full_module || '',
        source: node.source || 'production',
        isNotebook: node.is_notebook || false,
        notebookPath: node.notebook_path || null,
        moduleColor: node.module_info?.color || '#666',
        returnType: node.return_type,
        doc: node.doc,
        tags: node.tags,
        dependencies: node.dependencies,
        isSource,
        isSink,
        isHighlighted: false,
        isDimmed: false,
      },
    };
  });

  // Convert to React Flow edges
  const edges: Edge[] = graph.links.map(link => ({
    id: `${link.source}-${link.target}`,
    source: link.source,
    target: link.target,
    type: 'smoothstep',
    animated: false,
    style: { stroke: '#9ca3af', strokeWidth: 2 },
  }));

  return { nodes, edges };
}

// Find all upstream nodes for a given node
export function findUpstream(nodeId: string, links: { source: string; target: string }[]): Set<string> {
  const upstream = new Set<string>([nodeId]);

  function traverse(id: string) {
    links.forEach(link => {
      if (link.target === id && !upstream.has(link.source)) {
        upstream.add(link.source);
        traverse(link.source);
      }
    });
  }

  traverse(nodeId);
  return upstream;
}

// Find all downstream nodes for a given node
export function findDownstream(nodeId: string, links: { source: string; target: string }[]): Set<string> {
  const downstream = new Set<string>([nodeId]);

  function traverse(id: string) {
    links.forEach(link => {
      if (link.source === id && !downstream.has(link.target)) {
        downstream.add(link.target);
        traverse(link.target);
      }
    });
  }

  traverse(nodeId);
  return downstream;
}

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { PipelineNodeData } from './types';

interface PipelineNodeProps {
  data: PipelineNodeData;
}

function PipelineNode({ data }: PipelineNodeProps) {
  const {
    label,
    module,
    moduleColor,
    doc,
    isSource,
    isSink,
    isHighlighted,
    isDimmed,
    isNotebook,
    hasCachedData,
    hasVisualizations,
    visualizationCount,
  } = data;

  // Extract first sentence for description
  const description = doc?.split('.')[0] || '';

  return (
    <div
      className={`pipeline-node ${isHighlighted ? 'highlighted' : ''} ${isDimmed ? 'dimmed' : ''}`}
    >
      {!isSource && (
        <Handle
          type="target"
          position={Position.Left}
          className="handle handle-target"
        />
      )}

      <div className="node-header">
        <span
          className="node-color-dot"
          style={{ backgroundColor: moduleColor }}
        />
        <div className="node-info">
          <div className="node-name">
            {label}
            {isNotebook && (
              <span className="node-notebook-indicator" title="From Jupyter notebook">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                  <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                </svg>
              </span>
            )}
          </div>
          <div className="node-module">{module}</div>
        </div>
        <div className="node-status-indicators">
          {hasCachedData && (
            <span className="node-status-dot data" title="Cached data available" />
          )}
          {hasVisualizations && (
            <span
              className="node-status-dot viz"
              title={`${visualizationCount || 0} visualization${visualizationCount !== 1 ? 's' : ''}`}
            />
          )}
        </div>
      </div>

      {description && <div className="node-description">{description}</div>}

      {!isSink && (
        <Handle
          type="source"
          position={Position.Right}
          className="handle handle-source"
        />
      )}
    </div>
  );
}

export default memo(PipelineNode);

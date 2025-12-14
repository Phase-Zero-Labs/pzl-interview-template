/**
 * Modal component for displaying execution history for a specific node.
 *
 * Shows past runs with status, duration, and expandable logs.
 */

import { useState } from 'react';
import {
  useJobHistory,
  useJobLogs,
  useNodeStats,
  formatDuration,
  formatRelativeTime,
  type HistoricalJob,
} from './hooks/useJobHistory';
import './NodeHistoryModal.css';

interface NodeHistoryModalProps {
  nodeId: string;
  onClose: () => void;
}

export function NodeHistoryModal({ nodeId, onClose }: NodeHistoryModalProps) {
  const { jobs, total, hasMore, loading, loadMore, refresh } = useJobHistory({
    nodeId,
    limit: 10,
  });
  const stats = useNodeStats(nodeId);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  return (
    <div className="history-modal" onClick={onClose}>
      <div className="history-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="history-modal-header">
          <div className="history-header-left">
            <h3>Execution History</h3>
            <span className="history-node-name">{nodeId}</span>
          </div>
          <button className="close-modal" onClick={onClose}>&times;</button>
        </div>

        {/* Stats Summary */}
        <div className="history-stats">
          <div className="stat-item">
            <span className="stat-value">{stats.total}</span>
            <span className="stat-label">Total Runs</span>
          </div>
          <div className="stat-item stat-success">
            <span className="stat-value">{stats.completed}</span>
            <span className="stat-label">Completed</span>
          </div>
          <div className="stat-item stat-failed">
            <span className="stat-value">{stats.failed}</span>
            <span className="stat-label">Failed</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{formatDuration(stats.avgDuration)}</span>
            <span className="stat-label">Avg Duration</span>
          </div>
        </div>

        {/* Jobs List */}
        <div className="history-list">
          {loading && jobs.length === 0 ? (
            <div className="history-loading">
              <div className="spinner" />
              <p>Loading history...</p>
            </div>
          ) : jobs.length === 0 ? (
            <div className="history-empty">
              <p>No execution history for this node yet.</p>
              <p className="history-empty-hint">Run this node to create history.</p>
            </div>
          ) : (
            <>
              {jobs.map((job) => (
                <JobHistoryItem
                  key={job.id}
                  job={job}
                  isExpanded={expandedJobId === job.id}
                  onToggle={() =>
                    setExpandedJobId(expandedJobId === job.id ? null : job.id)
                  }
                />
              ))}
              {hasMore && (
                <button
                  className="history-load-more"
                  onClick={loadMore}
                  disabled={loading}
                >
                  {loading ? 'Loading...' : `Load More (${total - jobs.length} remaining)`}
                </button>
              )}
            </>
          )}
        </div>

        <div className="history-modal-footer">
          <button className="history-refresh-btn" onClick={refresh} disabled={loading}>
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
}

interface JobHistoryItemProps {
  job: HistoricalJob;
  isExpanded: boolean;
  onToggle: () => void;
}

function JobHistoryItem({ job, isExpanded, onToggle }: JobHistoryItemProps) {
  const duration = job.end_time ? job.end_time - job.start_time : null;

  return (
    <div className={`history-item ${isExpanded ? 'expanded' : ''}`}>
      <div className="history-item-header" onClick={onToggle}>
        <div className="history-item-left">
          <div className={`history-status history-status-${job.status}`}>
            {job.status === 'running' && <div className="spinner-tiny" />}
            <span>{job.status}</span>
          </div>
          <span className="history-time">{formatRelativeTime(job.start_time)}</span>
        </div>
        <div className="history-item-right">
          <span className="history-duration">{formatDuration(duration)}</span>
          <span className={`history-expand-icon ${isExpanded ? 'expanded' : ''}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
        </div>
      </div>

      {isExpanded && <ExpandedJobLogs jobId={job.id} />}
    </div>
  );
}

function ExpandedJobLogs({ jobId }: { jobId: string }) {
  const { job, logs, loading, error } = useJobLogs(jobId);

  if (loading) {
    return (
      <div className="history-logs-loading">
        <div className="spinner-small" />
        <span>Loading logs...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="history-logs-error">
        <span>Failed to load logs: {error}</span>
      </div>
    );
  }

  return (
    <div className="history-logs">
      <div className="history-logs-meta">
        <span>Job ID: {jobId}</span>
        {job?.start_time && (
          <span>Started: {new Date(job.start_time).toLocaleString()}</span>
        )}
        {job?.end_time && (
          <span>Ended: {new Date(job.end_time).toLocaleString()}</span>
        )}
        {job?.exit_code !== null && job?.exit_code !== undefined && (
          <span>Exit Code: {job.exit_code}</span>
        )}
      </div>
      <div className="history-logs-output">
        {logs.length === 0 ? (
          <div className="history-logs-empty">No logs recorded</div>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              className={`history-log-line ${log.stream === 'stderr' ? 'stderr' : ''}`}
            >
              {log.line}
            </div>
          ))
        )}
      </div>
      {job?.error_message && (
        <div className="history-error-message">
          <strong>Error:</strong> {job.error_message}
        </div>
      )}
    </div>
  );
}

export default NodeHistoryModal;

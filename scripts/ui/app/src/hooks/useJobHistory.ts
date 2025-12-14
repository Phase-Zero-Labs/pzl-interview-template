/**
 * Hook for fetching job history from the server.
 *
 * Supports filtering by node and pagination.
 */

import { useState, useEffect, useCallback } from 'react';

export interface HistoricalJob {
  id: string;
  node_id: string;
  status: 'running' | 'completed' | 'failed';
  start_time: number;
  end_time: number | null;
  exit_code: number | null;
  error_message: string | null;
}

export interface HistoricalLogLine {
  id: number;
  job_id: string;
  timestamp: number;
  stream: 'stdout' | 'stderr';
  line: string;
}

interface UseJobHistoryOptions {
  nodeId?: string;
  status?: string;
  limit?: number;
  autoFetch?: boolean;
}

interface JobHistoryState {
  jobs: HistoricalJob[];
  total: number;
  hasMore: boolean;
  loading: boolean;
  error: string | null;
}

export function useJobHistory(options: UseJobHistoryOptions = {}) {
  const { nodeId, status, limit = 20, autoFetch = true } = options;

  const [state, setState] = useState<JobHistoryState>({
    jobs: [],
    total: 0,
    hasMore: false,
    loading: false,
    error: null,
  });

  const [offset, setOffset] = useState(0);

  const fetchHistory = useCallback(async (newOffset: number = 0) => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const params = new URLSearchParams();
      if (nodeId) params.set('node', nodeId);
      if (status) params.set('status', status);
      params.set('limit', String(limit));
      params.set('offset', String(newOffset));

      const response = await fetch(`/api/history?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch history');
      }

      const data = await response.json();

      setState((prev) => ({
        jobs: newOffset === 0 ? data.jobs : [...prev.jobs, ...data.jobs],
        total: data.total,
        hasMore: data.hasMore,
        loading: false,
        error: null,
      }));

      setOffset(newOffset);
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      }));
    }
  }, [nodeId, status, limit]);

  const loadMore = useCallback(() => {
    if (state.hasMore && !state.loading) {
      fetchHistory(offset + limit);
    }
  }, [fetchHistory, offset, limit, state.hasMore, state.loading]);

  const refresh = useCallback(() => {
    setOffset(0);
    fetchHistory(0);
  }, [fetchHistory]);

  useEffect(() => {
    if (autoFetch) {
      fetchHistory(0);
    }
  }, [fetchHistory, autoFetch]);

  return {
    ...state,
    loadMore,
    refresh,
    fetchHistory,
  };
}

/**
 * Hook for fetching logs for a specific historical job.
 */
export function useJobLogs(jobId: string | null) {
  const [state, setState] = useState<{
    job: HistoricalJob | null;
    logs: HistoricalLogLine[];
    loading: boolean;
    error: string | null;
  }>({
    job: null,
    logs: [],
    loading: false,
    error: null,
  });

  const fetchLogs = useCallback(async () => {
    if (!jobId) return;

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const response = await fetch(`/api/history/${jobId}/logs`);
      if (!response.ok) {
        throw new Error('Failed to fetch logs');
      }

      const data = await response.json();

      setState({
        job: data.job,
        logs: data.logs,
        loading: false,
        error: null,
      });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      }));
    }
  }, [jobId]);

  useEffect(() => {
    if (jobId) {
      fetchLogs();
    } else {
      setState({
        job: null,
        logs: [],
        loading: false,
        error: null,
      });
    }
  }, [jobId, fetchLogs]);

  return state;
}

/**
 * Hook for fetching node execution stats.
 */
export function useNodeStats(nodeId: string | null) {
  const [state, setState] = useState<{
    total: number;
    completed: number;
    failed: number;
    avgDuration: number | null;
    loading: boolean;
    error: string | null;
  }>({
    total: 0,
    completed: 0,
    failed: 0,
    avgDuration: null,
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (!nodeId) {
      setState({
        total: 0,
        completed: 0,
        failed: 0,
        avgDuration: null,
        loading: false,
        error: null,
      });
      return;
    }

    setState((prev) => ({ ...prev, loading: true }));

    fetch(`/api/history/${nodeId}/stats`)
      .then((res) => res.json())
      .then((data) => {
        setState({
          ...data,
          loading: false,
          error: null,
        });
      })
      .catch((err) => {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: err.message,
        }));
      });
  }, [nodeId]);

  return state;
}

/**
 * Hook for fetching history counts per node (for badges).
 */
export function useHistoryCounts() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);

  const fetchCounts = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/history/counts');
      if (response.ok) {
        const data = await response.json();
        setCounts(data);
      }
    } catch (err) {
      console.error('Failed to fetch history counts:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  return { counts, loading, refresh: fetchCounts };
}

/**
 * Format duration in milliseconds to human-readable string.
 */
export function formatDuration(ms: number | null): string {
  if (ms === null) return '--';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Format timestamp to relative time.
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(timestamp).toLocaleDateString();
}

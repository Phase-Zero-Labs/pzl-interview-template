/**
 * Hook for streaming job logs via Server-Sent Events.
 *
 * Provides real-time log updates instead of polling.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export interface LogLine {
  id: number;
  timestamp: number;
  stream: 'stdout' | 'stderr';
  line: string;
}

export interface JobStreamState {
  status: 'idle' | 'connecting' | 'running' | 'completed' | 'failed' | 'error';
  logs: LogLine[];
  startTime: number | null;
  endTime: number | null;
  duration: number | null;
  exitCode: number | null;
  nodeId: string | null;
  error: string | null;
}

interface UseJobStreamOptions {
  onComplete?: (state: JobStreamState) => void;
  onError?: (error: string) => void;
}

export function useJobStream(
  jobId: string | null,
  options: UseJobStreamOptions = {}
): JobStreamState & { close: () => void } {
  const [state, setState] = useState<JobStreamState>({
    status: 'idle',
    logs: [],
    startTime: null,
    endTime: null,
    duration: null,
    exitCode: null,
    nodeId: null,
    error: null,
  });

  const eventSourceRef = useRef<EventSource | null>(null);

  // Use refs for callbacks to avoid dependency issues
  const onCompleteRef = useRef(options.onComplete);
  const onErrorRef = useRef(options.onError);

  // Update refs when callbacks change
  useEffect(() => {
    onCompleteRef.current = options.onComplete;
    onErrorRef.current = options.onError;
  }, [options.onComplete, options.onError]);

  const close = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!jobId) {
      setState({
        status: 'idle',
        logs: [],
        startTime: null,
        endTime: null,
        duration: null,
        exitCode: null,
        nodeId: null,
        error: null,
      });
      return;
    }

    // Close any existing connection
    close();

    const eventSource = new EventSource(`/api/job/${jobId}/stream`);
    eventSourceRef.current = eventSource;

    eventSource.addEventListener('status', (e) => {
      const data = JSON.parse(e.data);
      setState((prev) => ({
        ...prev,
        status: data.status === 'running' ? 'running' : prev.status,
        nodeId: data.nodeId,
        startTime: data.startTime,
      }));
    });

    eventSource.addEventListener('log', (e) => {
      const data = JSON.parse(e.data);
      setState((prev) => ({
        ...prev,
        status: 'running',
        logs: [...prev.logs, data],
      }));
    });

    eventSource.addEventListener('complete', (e) => {
      const data = JSON.parse(e.data);
      setState((prev) => {
        const newState: JobStreamState = {
          ...prev,
          status: data.status,
          endTime: data.endTime,
          duration: data.duration,
          exitCode: data.exitCode,
        };
        onCompleteRef.current?.(newState);
        return newState;
      });
      eventSource.close();
    });

    eventSource.onerror = () => {
      // Check if job completed (normal close) or actual error
      setState((prev) => {
        if (prev.status === 'completed' || prev.status === 'failed') {
          return prev;
        }
        const errorMsg = 'Connection lost';
        onErrorRef.current?.(errorMsg);
        return {
          ...prev,
          status: 'error',
          error: errorMsg,
        };
      });
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [jobId, close]);

  return { ...state, close };
}

/**
 * Format elapsed time as a human-readable string.
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
 * Format a timestamp as a relative time string.
 */
export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString();
}

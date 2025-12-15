/**
 * PZL-DSS Sync Client
 *
 * Handles syncing metadata, run history, and (optionally) data files
 * to a central pzl-dss-mother system.
 *
 * Sync Strategy:
 * - Auto-sync (lightweight): Metadata, DAG structure, run history, logs
 * - Manual sync (heavy): Parquet files, images (only nodes with @sync tag or explicit request)
 *
 * Graceful degradation: Sync failures are non-fatal, queued for retry.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, basename } from "path";
import { createHash } from "crypto";

// ============================================================================
// Types
// ============================================================================

export interface SyncConfig {
  motherUrl: string;
  projectId: string;
  projectName: string;
  enabled: boolean;
}

export interface CacheEntry {
  nodeId: string;
  path: string;
  rows: number;
  columns: string[];
  cachedAt: number;
  syncStatus: "local" | "pending" | "synced";
  hash?: string;
  shouldSync: boolean;
}

export interface MetadataSyncPayload {
  projectId: string;
  projectName: string;
  timestamp: number;
  dag: {
    nodes: Array<{
      id: string;
      module: string;
      returnType: string;
      tags: Array<{ label: string; color: string }>;
      dependencies: string[];
    }>;
    links: Array<{ source: string; target: string }>;
  };
  runs: Array<{
    jobId: string;
    nodeId: string;
    status: "completed" | "failed";
    startTime: number;
    duration: number;
    error?: string;
  }>;
  cacheManifest: CacheEntry[];
}

export interface SyncState {
  lastMetadataSync: number | null;
  lastDataSync: number | null;
  pendingUploads: string[];
  syncErrors: Array<{ timestamp: number; error: string; operation: string }>;
  motherConnected: boolean;
}

export interface SyncResult {
  success: boolean;
  synced: number;
  failed: number;
  errors?: string[];
}

// ============================================================================
// Sync State Management
// ============================================================================

const STATE_DIR = ".pzl-dss";
const STATE_FILE = join(STATE_DIR, "sync_state.json");
const CACHE_INDEX_FILE = join(STATE_DIR, "cache_index.json");

function ensureStateDir(): void {
  if (!existsSync(STATE_DIR)) {
    mkdirSync(STATE_DIR, { recursive: true });
  }
}

export function loadSyncState(): SyncState {
  ensureStateDir();
  if (existsSync(STATE_FILE)) {
    try {
      return JSON.parse(readFileSync(STATE_FILE, "utf-8"));
    } catch {
      // Corrupted state, return default
    }
  }
  return {
    lastMetadataSync: null,
    lastDataSync: null,
    pendingUploads: [],
    syncErrors: [],
    motherConnected: false,
  };
}

export function saveSyncState(state: SyncState): void {
  ensureStateDir();
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

export function loadCacheIndex(): Record<string, CacheEntry> {
  ensureStateDir();
  if (existsSync(CACHE_INDEX_FILE)) {
    try {
      return JSON.parse(readFileSync(CACHE_INDEX_FILE, "utf-8"));
    } catch {
      // Corrupted index, return empty
    }
  }
  return {};
}

export function saveCacheIndex(index: Record<string, CacheEntry>): void {
  ensureStateDir();
  writeFileSync(CACHE_INDEX_FILE, JSON.stringify(index, null, 2));
}

export function updateCacheEntry(entry: CacheEntry): void {
  const index = loadCacheIndex();
  index[entry.nodeId] = entry;
  saveCacheIndex(index);
}

// ============================================================================
// Sync Client
// ============================================================================

export class SyncClient {
  private config: SyncConfig;
  private state: SyncState;
  private retryQueue: Array<{ operation: string; payload: unknown; attempts: number }> = [];

  constructor(config: Partial<SyncConfig> = {}) {
    this.config = {
      motherUrl: config.motherUrl || process.env.PZL_DSS_MOTHER_URL || "http://pzl-dss-mother.tailscale:8080",
      projectId: config.projectId || this.generateProjectId(),
      projectName: config.projectName || this.getProjectName(),
      enabled: config.enabled ?? true,
    };
    this.state = loadSyncState();
  }

  private generateProjectId(): string {
    const cwd = process.cwd();
    const dirName = basename(cwd);
    const hash = createHash("md5").update(cwd).digest("hex").slice(0, 8);
    return `proj_${dirName}_${hash}`;
  }

  private getProjectName(): string {
    const cwd = process.cwd();
    return basename(cwd);
  }

  // ============================================================================
  // Connection Management
  // ============================================================================

  async checkConnection(): Promise<boolean> {
    if (!this.config.enabled) {
      return false;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(`${this.config.motherUrl}/health`, {
        signal: controller.signal,
      });

      clearTimeout(timeout);

      this.state.motherConnected = response.ok;
      saveSyncState(this.state);
      return response.ok;
    } catch {
      this.state.motherConnected = false;
      saveSyncState(this.state);
      return false;
    }
  }

  // ============================================================================
  // Metadata Sync (Auto - Lightweight)
  // ============================================================================

  async syncMetadata(payload: MetadataSyncPayload): Promise<SyncResult> {
    if (!this.config.enabled) {
      return { success: true, synced: 0, failed: 0 };
    }

    try {
      const response = await this.fetchWithRetry(
        `${this.config.motherUrl}/api/projects/${this.config.projectId}/sync/metadata`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (response.ok) {
        this.state.lastMetadataSync = Date.now();
        saveSyncState(this.state);
        return { success: true, synced: 1, failed: 0 };
      } else {
        const error = await response.text();
        this.logError("metadata_sync", error);
        return { success: false, synced: 0, failed: 1, errors: [error] };
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logError("metadata_sync", errorMessage);
      this.queueForRetry("metadata_sync", payload);
      return { success: false, synced: 0, failed: 1, errors: [errorMessage] };
    }
  }

  // ============================================================================
  // Data Sync (Manual - Heavy)
  // ============================================================================

  async syncDataFiles(nodeIds: string[]): Promise<SyncResult> {
    if (!this.config.enabled) {
      return { success: true, synced: 0, failed: 0 };
    }

    const cacheIndex = loadCacheIndex();
    const results = { success: true, synced: 0, failed: 0, errors: [] as string[] };

    for (const nodeId of nodeIds) {
      const entry = cacheIndex[nodeId];
      if (!entry) {
        results.errors.push(`No cache entry for ${nodeId}`);
        results.failed++;
        continue;
      }

      try {
        const filePath = entry.path;
        if (!existsSync(filePath)) {
          results.errors.push(`File not found: ${filePath}`);
          results.failed++;
          continue;
        }

        const fileContent = readFileSync(filePath);
        const formData = new FormData();
        formData.append("file", new Blob([fileContent]), basename(filePath));
        formData.append("nodeId", nodeId);
        formData.append("projectId", this.config.projectId);
        formData.append("metadata", JSON.stringify(entry));

        const response = await this.fetchWithRetry(
          `${this.config.motherUrl}/api/projects/${this.config.projectId}/sync/data`,
          {
            method: "POST",
            body: formData,
          }
        );

        if (response.ok) {
          entry.syncStatus = "synced";
          updateCacheEntry(entry);
          results.synced++;
        } else {
          const error = await response.text();
          results.errors.push(`Failed to sync ${nodeId}: ${error}`);
          results.failed++;
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.errors.push(`Error syncing ${nodeId}: ${errorMessage}`);
        results.failed++;
      }
    }

    if (results.synced > 0) {
      this.state.lastDataSync = Date.now();
      saveSyncState(this.state);
    }

    results.success = results.failed === 0;
    return results;
  }

  // ============================================================================
  // Retry Logic
  // ============================================================================

  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    maxRetries: number = 3
  ): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });

        clearTimeout(timeout);
        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < maxRetries - 1) {
          // Exponential backoff: 1s, 2s, 4s
          await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
        }
      }
    }

    throw lastError || new Error("Fetch failed after retries");
  }

  private queueForRetry(operation: string, payload: unknown): void {
    this.retryQueue.push({ operation, payload, attempts: 0 });
    this.state.pendingUploads = this.retryQueue.map((r) => r.operation);
    saveSyncState(this.state);
  }

  private logError(operation: string, error: string): void {
    this.state.syncErrors.push({
      timestamp: Date.now(),
      operation,
      error,
    });
    // Keep only last 50 errors
    if (this.state.syncErrors.length > 50) {
      this.state.syncErrors = this.state.syncErrors.slice(-50);
    }
    saveSyncState(this.state);
  }

  // ============================================================================
  // Status
  // ============================================================================

  getStatus(): {
    connected: boolean;
    lastMetadataSync: number | null;
    lastDataSync: number | null;
    pendingCount: number;
    errorCount: number;
    config: SyncConfig;
  } {
    return {
      connected: this.state.motherConnected,
      lastMetadataSync: this.state.lastMetadataSync,
      lastDataSync: this.state.lastDataSync,
      pendingCount: this.state.pendingUploads.length,
      errorCount: this.state.syncErrors.length,
      config: this.config,
    };
  }

  getRecentErrors(limit: number = 10): Array<{ timestamp: number; error: string; operation: string }> {
    return this.state.syncErrors.slice(-limit);
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

export function buildMetadataSyncPayload(
  graphData: { nodes: unknown[]; links: unknown[] },
  recentRuns: Array<{
    id: string;
    node_id: string;
    status: string;
    start_time: number;
    end_time?: number;
    error_message?: string;
  }>,
  projectId: string,
  projectName: string
): MetadataSyncPayload {
  const cacheIndex = loadCacheIndex();

  return {
    projectId,
    projectName,
    timestamp: Date.now(),
    dag: {
      nodes: (graphData.nodes as Array<{
        id: string;
        module: string;
        return_type: string;
        tags: Array<{ label: string; color: string }>;
        dependencies: string[];
      }>).map((n) => ({
        id: n.id,
        module: n.module,
        returnType: n.return_type,
        tags: n.tags,
        dependencies: n.dependencies,
      })),
      links: graphData.links as Array<{ source: string; target: string }>,
    },
    runs: recentRuns.map((r) => ({
      jobId: r.id,
      nodeId: r.node_id,
      status: r.status as "completed" | "failed",
      startTime: r.start_time,
      duration: r.end_time ? r.end_time - r.start_time : 0,
      error: r.error_message,
    })),
    cacheManifest: Object.values(cacheIndex),
  };
}

// Default export for easy import
export default SyncClient;

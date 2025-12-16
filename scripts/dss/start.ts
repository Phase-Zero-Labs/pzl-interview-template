#!/usr/bin/env bun
/**
 * PZL-DSS - Phase Zero Labs Data Science System
 *
 * Single executable that:
 * 1. Builds the React frontend using Bun's native bundler
 * 2. Serves both API and static files from one process
 * 3. Handles graceful shutdown and error recovery
 * 4. Auto-restarts on crashes (resilient mode)
 * 5. Auto-opens browser (configurable)
 *
 * Usage:
 *   bun start                    # Production mode, auto-opens browser
 *   bun start --no-open          # Don't auto-open browser
 *   bun start --dev              # Development (watch mode)
 *   bun start --no-build         # Skip build step
 *   bun start --no-sync          # Disable sync to central DSS
 *   bun start --no-cache         # Disable auto parquet caching
 */

import { spawn, $ } from "bun";
import { existsSync, mkdirSync, rmSync, cpSync, watch } from "fs";
import { join, dirname } from "path";
import {
  initDatabase,
  insertJob,
  updateJob,
  insertLog,
  getJob,
  getJobLogs,
  getHistory,
  getNodeStats,
  getHistoryCountByNode,
  closeDatabase,
  type Job,
  type LogLine,
} from "./db";
import {
  SyncClient,
  loadSyncState,
  loadCacheIndex,
  updateCacheEntry,
  buildMetadataSyncPayload,
  type CacheEntry,
} from "./sync";

// ============================================================================
// Configuration
// ============================================================================

const PORT = parseInt(process.env.PORT || "5050");
const UI_DIR = import.meta.dir;
const APP_DIR = join(UI_DIR, "app");
const DIST_DIR = join(UI_DIR, "dist");
const SRC_DIR = join(APP_DIR, "src");

const args = process.argv.slice(2);
const DEV_MODE = args.includes("--dev");
const SKIP_BUILD = args.includes("--no-build");
const NO_OPEN = args.includes("--no-open");
const NO_SYNC = args.includes("--no-sync");
const NO_CACHE = args.includes("--no-cache");
const WATCH_MODE = DEV_MODE;

// Resilience configuration
const MAX_RESTART_ATTEMPTS = 5;
const RESTART_DELAY_MS = 1000;
let restartAttempts = 0;
let lastRestartTime = 0;

// Initialize sync client (lazy)
let syncClient: SyncClient | null = null;
function getSyncClient(): SyncClient {
  if (!syncClient) {
    syncClient = new SyncClient({ enabled: !NO_SYNC });
  }
  return syncClient;
}

// ============================================================================
// Logging with timestamps
// ============================================================================

function log(level: "info" | "warn" | "error", message: string) {
  const timestamp = new Date().toISOString().split("T")[1].split(".")[0];
  const prefix = {
    info: "\x1b[36m[INFO]\x1b[0m",
    warn: "\x1b[33m[WARN]\x1b[0m",
    error: "\x1b[31m[ERROR]\x1b[0m",
  }[level];
  console.log(`${timestamp} ${prefix} ${message}`);
}

// ============================================================================
// Build System
// ============================================================================

async function buildFrontend(): Promise<boolean> {
  log("info", "Building frontend with Bun bundler...");

  // Clean dist directory
  if (existsSync(DIST_DIR)) {
    rmSync(DIST_DIR, { recursive: true });
  }
  mkdirSync(DIST_DIR, { recursive: true });

  // Build with Bun's native bundler
  const result = await Bun.build({
    entrypoints: [join(SRC_DIR, "main.tsx")],
    outdir: DIST_DIR,
    target: "browser",
    format: "esm",
    splitting: true,
    minify: !DEV_MODE,
    sourcemap: DEV_MODE ? "linked" : "none",
    define: {
      "process.env.NODE_ENV": JSON.stringify(DEV_MODE ? "development" : "production"),
    },
    loader: {
      ".tsx": "tsx",
      ".ts": "ts",
      ".css": "css",
      ".svg": "file",
      ".png": "file",
      ".jpg": "file",
    },
  });

  if (!result.success) {
    log("error", "Build failed:");
    for (const logEntry of result.logs) {
      console.error(logEntry);
    }
    return false;
  }

  // Find the main JS and CSS outputs
  let mainJs = "";
  let mainCss = "";
  for (const output of result.outputs) {
    const name = output.path.split("/").pop() || "";
    if (name.endsWith(".js") && name.startsWith("main")) {
      mainJs = name;
    } else if (name.endsWith(".css")) {
      mainCss = name;
    }
  }

  // Generate index.html with cache-busting
  const indexHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PZL-DSS</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    ${mainCss ? `<link rel="stylesheet" href="/${mainCss}" />` : ""}
    <style>
      body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
      #root { min-height: 100vh; }
      .loading { display: flex; align-items: center; justify-content: center; height: 100vh; color: #666; }
    </style>
  </head>
  <body>
    <div id="root"><div class="loading">Loading PZL-DSS...</div></div>
    <script type="module" src="/${mainJs}"></script>
  </body>
</html>`;

  await Bun.write(join(DIST_DIR, "index.html"), indexHtml);

  // Copy public assets
  const publicDir = join(APP_DIR, "public");
  if (existsSync(publicDir)) {
    cpSync(publicDir, DIST_DIR, { recursive: true });
  }

  // Create favicon - PZL branding
  const faviconPath = join(DIST_DIR, "favicon.svg");
  if (!existsSync(faviconPath)) {
    const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="20" fill="#0066CC"/>
  <text x="50" y="42" font-family="monospace" font-size="24" font-weight="bold" fill="white" text-anchor="middle">PZL</text>
  <text x="50" y="72" font-family="monospace" font-size="24" font-weight="bold" fill="white" text-anchor="middle">DSS</text>
</svg>`;
    await Bun.write(faviconPath, favicon);
  }

  log("info", `Build complete: ${result.outputs.length} files`);
  return true;
}

// ============================================================================
// Kill existing server on port
// ============================================================================

async function killExistingServer(port: number): Promise<void> {
  try {
    const result = await $`lsof -ti :${port}`.quiet();
    const pids = result.stdout.toString().trim().split("\n").filter(Boolean);
    for (const pid of pids) {
      if (pid !== String(process.pid)) {
        log("info", `Killing existing process on port ${port} (PID: ${pid})`);
        await $`kill ${pid}`.quiet();
      }
    }
    if (pids.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  } catch {
    // No process found on port
  }
}

// ============================================================================
// Graceful shutdown handling
// ============================================================================

let isShuttingDown = false;
let server: ReturnType<typeof Bun.serve> | null = null;

function setupShutdownHandlers() {
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    log("info", `Received ${signal}, shutting down gracefully...`);

    // Close server
    if (server) {
      server.stop();
      log("info", "HTTP server stopped");
    }

    // Close database
    closeDatabase();
    log("info", "Database closed");

    // Cancel any running pipeline jobs
    for (const [jobId, job] of runningJobs) {
      if (job.status === "running" && job.process) {
        log("info", `Terminating job ${jobId}`);
        job.process.kill();
      }
    }

    log("info", "Shutdown complete");
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("uncaughtException", (err) => {
    log("error", `Uncaught exception: ${err.message}`);
    console.error(err.stack);
    if (!DEV_MODE) {
      shutdown("uncaughtException");
    }
  });
  process.on("unhandledRejection", (reason) => {
    log("error", `Unhandled rejection: ${reason}`);
    if (!DEV_MODE) {
      shutdown("unhandledRejection");
    }
  });
}

// ============================================================================
// Hamilton Graph Data
// ============================================================================

interface GraphConfig {
  modules: string[];
  title: string;
  projectPath: string;
  resultsPath: string;
}

const ENVIRONMENTS: Record<string, GraphConfig> = {
  production: {
    modules: [],
    title: "PZL-DSS Pipeline",
    projectPath: "pzl-dss-template",
    resultsPath: "results",
  },
};

let currentEnv = "production";

function getConfig(): GraphConfig {
  return ENVIRONMENTS[currentEnv] || ENVIRONMENTS.production;
}

async function getGraphData(): Promise<any> {
  const config = getConfig();
  const pythonPath = process.cwd() + "/.venv/bin/python";
  const introspectScript = join(UI_DIR, "introspect.py");

  const proc = spawn({
    cmd: [
      pythonPath,
      introspectScript,
      "--title", config.title,
      "--project", config.projectPath,
      "--env", currentEnv,
    ],
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  });

  const output = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();

  if (stderr && !stderr.includes("Note: Hamilton collects")) {
    log("warn", `Python stderr: ${stderr.slice(0, 200)}`);
  }

  try {
    return JSON.parse(output.trim());
  } catch (e) {
    log("error", `Failed to parse graph data: ${output.slice(0, 500)}`);
    throw new Error(`Failed to parse graph data: ${e}`);
  }
}

// ============================================================================
// Visualization Discovery
// ============================================================================

interface NodeVizConfig {
  output_dir?: string;
  return_type?: string;
}

let nodeVizCache: Map<string, NodeVizConfig> = new Map();

function updateNodeVizCache(graphData: any) {
  nodeVizCache.clear();
  for (const node of graphData.nodes || []) {
    const config: NodeVizConfig = {
      return_type: node.return_type,
    };
    const doc = node.doc || "";
    const vizMatch = doc.match(/@viz_output:\s*([^\n]+)/i);
    if (vizMatch) {
      config.output_dir = vizMatch[1].trim();
    }
    nodeVizCache.set(node.id, config);
  }
}

async function findImagesInDir(dir: string, maxDepth: number = 3): Promise<string[]> {
  try {
    const proc = spawn({
      cmd: ["find", dir, "-maxdepth", String(maxDepth), "-type", "f", "-name", "*.png"],
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = await new Response(proc.stdout).text();
    return output
      .trim()
      .split("\n")
      .filter((f) => f && !f.includes("/."));
  } catch {
    return [];
  }
}

async function dirExists(path: string): Promise<boolean> {
  try {
    const proc = spawn({ cmd: ["test", "-d", path] });
    await proc.exited;
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

async function findVisualizations(
  nodeId: string
): Promise<{ images: string[]; parquets: string[]; totalAvailable: number; outputDir?: string }> {
  const images: string[] = [];
  const parquets: string[] = [];
  let totalAvailable = 0;
  let outputDir: string | undefined;
  const cwd = process.cwd();
  const nodeConfig = nodeVizCache.get(nodeId);

  // Priority 0: Direct PNG file in results/ matching node name (e.g., results/node_name.png)
  const directVizPath = `${cwd}/results/${nodeId}.png`;
  const directVizFile = Bun.file(directVizPath);
  if (await directVizFile.exists()) {
    images.push(`/results/${nodeId}.png`);
    totalAvailable = 1;
    outputDir = "results";
  }

  // Priority 1: Explicit @viz_output from docstring
  if (images.length === 0 && nodeConfig?.output_dir) {
    const explicitDir = nodeConfig.output_dir.startsWith("/")
      ? nodeConfig.output_dir
      : `${cwd}/${nodeConfig.output_dir}`;

    if (await dirExists(explicitDir)) {
      outputDir = nodeConfig.output_dir;
      const found = await findImagesInDir(explicitDir);
      totalAvailable = found.length;
      for (const f of found.slice(0, 24)) {
        images.push(f.replace(cwd, ""));
      }
    }
  }

  // Check results/{nodeId}/ convention
  if (images.length === 0) {
    const conventionDir = `${cwd}/results/${nodeId}`;
    if (await dirExists(conventionDir)) {
      outputDir = `results/${nodeId}`;
      const found = await findImagesInDir(conventionDir);
      totalAvailable = found.length;
      for (const f of found.slice(0, 24)) {
        images.push(f.replace(cwd, ""));
      }
    }
  }

  const dataDir = `${cwd}/data`;
  try {
    const parquetProc = spawn({
      cmd: ["find", dataDir, "-maxdepth", "2", "-type", "f", "-name", `*${nodeId}*.parquet`],
      stdout: "pipe",
      stderr: "pipe",
    });
    const parquetOutput = await new Response(parquetProc.stdout).text();
    const parquetFiles = parquetOutput
      .trim()
      .split("\n")
      .filter((f) => f);
    for (const file of parquetFiles.slice(0, 5)) {
      parquets.push(file.replace(cwd, ""));
    }
  } catch {}

  images.sort((a, b) => {
    const aIsCombined = a.includes("combined");
    const bIsCombined = b.includes("combined");
    if (aIsCombined && !bIsCombined) return -1;
    if (!aIsCombined && bIsCombined) return 1;
    return b.localeCompare(a);
  });

  return {
    images: images.slice(0, 24),
    parquets,
    totalAvailable,
    outputDir,
  };
}

// ============================================================================
// MIME Types and Static File Serving
// ============================================================================

function getMimeType(path: string): string {
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (path.endsWith(".css")) return "text/css; charset=utf-8";
  if (path.endsWith(".json")) return "application/json";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  if (path.endsWith(".gif")) return "image/gif";
  if (path.endsWith(".webp")) return "image/webp";
  if (path.endsWith(".woff")) return "font/woff";
  if (path.endsWith(".woff2")) return "font/woff2";
  if (path.endsWith(".map")) return "application/json";
  return "application/octet-stream";
}

// ============================================================================
// Pipeline Execution
// ============================================================================

interface RunningJob {
  status: string;
  output: string[];
  startTime: number;
  process?: ReturnType<typeof spawn>;
}

const runningJobs: Map<string, RunningJob> = new Map();

async function runPipeline(outputs: string[], nodeId: string): Promise<string> {
  const jobId = `job-${Date.now()}`;
  const pythonPath = process.cwd() + "/.venv/bin/python";

  insertJob({ id: jobId, node_id: nodeId, status: "running" });

  const job: RunningJob = {
    status: "running",
    output: [`Starting pipeline for outputs: ${outputs.join(", ")}`],
    startTime: Date.now(),
  };
  runningJobs.set(jobId, job);

  insertLog({ job_id: jobId, stream: "stdout", line: `Starting pipeline for outputs: ${outputs.join(", ")}` });

  const outputArgs = outputs.map((o) => `"${o}"`).join(", ");

  // Pass cache setting to Python
  const enableCache = !NO_CACHE;

  const proc = spawn({
    cmd: [
      pythonPath,
      "-c",
      `
import sys
import json
import re
import importlib
import pandas as pd
from pathlib import Path

# Setup directories
# Ensure cache directory exists
Path("results/cache").mkdir(parents=True, exist_ok=True)

CACHE_DIR = Path("results/cache")
ENABLE_CACHE = ${enableCache ? "True" : "False"}

from hamilton import driver

# Auto-discover modules from scripts/*.py
scripts_dir = Path('scripts')
modules = []
for py_file in scripts_dir.glob('*.py'):
    if py_file.name in ('__init__.py', 'run.py', 'config.py'):
        continue
    module_name = f'scripts.{py_file.stem}'
    try:
        modules.append(importlib.import_module(module_name))
    except ImportError as e:
        print(f'Warning: Could not import {module_name}: {e}', file=sys.stderr)

# Auto-discover notebooks
try:
    from scripts.utils.notebook_loader import create_synthetic_module
    for nb_file in scripts_dir.glob('*.ipynb'):
        if '.ipynb_checkpoints' in str(nb_file):
            continue
        module_name = f'scripts.{nb_file.stem}'
        try:
            module = create_synthetic_module(nb_file, module_name)
            if module:
                modules.append(module)
        except Exception as e:
            print(f'Warning: Could not load notebook {nb_file.name}: {e}', file=sys.stderr)
except ImportError:
    pass

if not modules:
    print(json.dumps({"status": "error", "message": "No Hamilton modules found in scripts/"}))
    sys.exit(1)

def should_cache(node) -> bool:
    """Check if node should be cached (no @no_cache tag)."""
    if not ENABLE_CACHE:
        return False
    doc = getattr(node, 'documentation', '') or ''
    return '@no_cache' not in doc.lower()

def get_sync_tag(node) -> bool:
    """Check if node has @sync tag."""
    doc = getattr(node, 'documentation', '') or ''
    return '@sync' in doc.lower()

print(f"Building Hamilton driver...", flush=True)
dr = driver.Builder().with_modules(*modules).build()

outputs = [${outputArgs}]
print(f"Executing pipeline for: {outputs}", flush=True)

try:
    results = dr.execute(final_vars=outputs)
    print(f"\\nPipeline complete!", flush=True)

    cached_nodes = []
    for name, result in results.items():
        if hasattr(result, 'shape'):
            print(f"  {name}: {result.shape[0]:,} rows x {result.shape[1]} cols", flush=True)

            # Auto-cache DataFrames unless @no_cache
            node = dr.graph.nodes.get(name)
            if node and isinstance(result, pd.DataFrame) and should_cache(node):
                cache_path = CACHE_DIR / f"{name}.parquet"
                try:
                    result.to_parquet(cache_path)
                    cached_nodes.append({
                        "node": name,
                        "path": str(cache_path),
                        "rows": len(result),
                        "columns": list(result.columns),
                        "sync": get_sync_tag(node)
                    })
                    print(f"    -> Cached to {cache_path}", flush=True)
                except Exception as cache_err:
                    print(f"    -> Cache failed: {cache_err}", flush=True)
        elif isinstance(result, dict):
            print(f"  {name}: {result}", flush=True)

    print(json.dumps({
        "status": "success",
        "outputs": list(results.keys()),
        "cached": cached_nodes
    }))
except Exception as e:
    print(f"Error: {e}", flush=True)
    import traceback
    traceback.print_exc()
    print(json.dumps({"status": "error", "message": str(e)}))
`,
    ],
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  });

  job.process = proc;

  (async () => {
    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      text
        .split("\n")
        .filter((l) => l.trim())
        .forEach((line) => {
          job.output.push(line);
          insertLog({ job_id: jobId, stream: "stdout", line });
        });
    }
  })();

  (async () => {
    const reader = proc.stderr.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      if (!text.includes("Note: Hamilton collects")) {
        text
          .split("\n")
          .filter((l) => l.trim())
          .forEach((line) => {
            job.output.push(`[stderr] ${line}`);
            insertLog({ job_id: jobId, stream: "stderr", line });
          });
      }
    }
  })();

  proc.exited
    .then((exitCode) => {
      const lastLine = job.output[job.output.length - 1] || "";
      let finalStatus: "completed" | "failed" = "completed";
      let errorMessage: string | undefined;

      try {
        const result = JSON.parse(lastLine);
        finalStatus = result.status === "success" ? "completed" : "failed";
        if (result.status !== "success") {
          errorMessage = result.message;
        }
      } catch {
        finalStatus = "completed";
      }

      job.status = finalStatus;
      updateJob(jobId, {
        status: finalStatus,
        exit_code: exitCode,
        error_message: errorMessage,
      });
    })
    .catch((err) => {
      job.status = "failed";
      updateJob(jobId, {
        status: "failed",
        error_message: String(err),
      });
    });

  return jobId;
}

// ============================================================================
// Data Catalog
// ============================================================================

interface CatalogEntry {
  id: string;
  name: string;
  type: "parquet" | "csv" | "xlsx" | "tsv" | "json";
  path: string;
  fileSize: string;
  lastModified: string;
  category: "source" | "cached" | "output";
  description?: string;
  tags: string[];
  columns?: string[];
  rowCount?: number;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

async function getDataCatalog(): Promise<CatalogEntry[]> {
  const entries: CatalogEntry[] = [];
  const cwd = process.cwd();

  // Find all data files in the project
  const findProc = spawn({
    cmd: [
      "sh",
      "-c",
      `find "${cwd}/data" "${cwd}/results" -type f \\( -name "*.csv" -o -name "*.tsv" -o -name "*.parquet" -o -name "*.xlsx" -o -name "*.json" \\) 2>/dev/null | grep -v __pycache__ | sort`,
    ],
    stdout: "pipe",
    stderr: "pipe",
  });

  const output = await new Response(findProc.stdout).text();
  const files = output.trim().split("\n").filter((f) => f);

  for (const filePath of files) {
    const relativePath = filePath.replace(cwd + "/", "");
    const fileName = filePath.split("/").pop() || "";
    const ext = fileName.split(".").pop()?.toLowerCase() || "";

    // Get file stats
    const statProc = spawn({
      cmd: ["stat", "-f", "%z %m", filePath],
      stdout: "pipe",
    });
    const statOutput = (await new Response(statProc.stdout).text()).trim();
    const [sizeStr, timestampStr] = statOutput.split(" ");
    const fileBytes = parseInt(sizeStr) || 0;
    const timestamp = parseInt(timestampStr) || 0;
    const lastModified = timestamp ? new Date(timestamp * 1000).toISOString().split("T")[0] : "";

    // Determine category based on path
    let category: CatalogEntry["category"] = "output";
    if (relativePath.startsWith("data/raw")) {
      category = "source";
    } else if (relativePath.startsWith("results/cache")) {
      category = "cached";
    }

    // Determine type
    let type: CatalogEntry["type"] = "csv";
    if (ext === "parquet") type = "parquet";
    else if (ext === "tsv") type = "tsv";
    else if (ext === "xlsx") type = "xlsx";
    else if (ext === "json") type = "json";

    // Generate display name from filename
    const baseName = fileName.replace(/\.[^.]+$/, "");
    const displayName = baseName
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

    // Tags based on location and type
    const tags: string[] = [ext.toUpperCase()];
    if (category === "source") tags.push("Source");
    else if (category === "cached") tags.push("Cached");

    entries.push({
      id: relativePath.replace(/[/.]/g, "_"),
      name: displayName,
      type,
      path: relativePath,
      fileSize: formatFileSize(fileBytes),
      lastModified,
      category,
      tags,
    });
  }

  // Sort: source files first, then by category, then by name
  const categoryOrder = { source: 0, cached: 1, output: 2 };
  entries.sort((a, b) => {
    const catDiff = categoryOrder[a.category] - categoryOrder[b.category];
    if (catDiff !== 0) return catDiff;
    return a.name.localeCompare(b.name);
  });

  return entries;
}

// ============================================================================
// Cached DataFrame Preview
// ============================================================================

async function getCachedDataFramePreview(
  nodeId: string,
  limit: number = 10
): Promise<{
  data: Record<string, unknown>[];
  columns: string[];
  dtypes: Record<string, string>;
  shape: [number, number];
  nodeType: string;
  cached: boolean;
  cachePath?: string;
  error?: string;
}> {
  const cwd = process.cwd();
  const pythonPath = cwd + "/.venv/bin/python";

  // Search cache first, then other locations
  const searchDirs = [`${cwd}/results/cache`, `${cwd}/results`, `${cwd}/data`];

  let cachedFile: string | null = null;

  for (const dir of searchDirs) {
    try {
      const exactMatch = `${dir}/${nodeId}.parquet`;
      const exactFile = Bun.file(exactMatch);
      if (await exactFile.exists()) {
        cachedFile = exactMatch;
        break;
      }

      const proc = spawn({
        cmd: ["find", dir, "-maxdepth", "3", "-type", "f", "-name", "*.parquet"],
        stdout: "pipe",
        stderr: "pipe",
      });
      const output = await new Response(proc.stdout).text();
      const files = output
        .trim()
        .split("\n")
        .filter((f) => f);

      for (const file of files) {
        const filename = file.split("/").pop()?.replace(".parquet", "") || "";
        if (filename === nodeId) {
          cachedFile = file;
          break;
        }
      }

      if (!cachedFile) {
        for (const file of files) {
          const filename = file.split("/").pop()?.replace(".parquet", "") || "";
          if (filename.includes(nodeId) || nodeId.includes(filename)) {
            cachedFile = file;
            break;
          }
        }
      }

      if (cachedFile) break;
    } catch {}
  }

  if (!cachedFile) {
    return {
      data: [],
      columns: [],
      dtypes: {},
      shape: [0, 0],
      nodeType: "unknown",
      cached: false,
      error: "No cached data found. Run this node first to generate data.",
    };
  }

  const proc = spawn({
    cmd: [
      pythonPath,
      "-c",
      `
import json
import pandas as pd
import numpy as np

file_path = "${cachedFile}"
limit = ${limit}

def clean_value(v):
    if pd.isna(v):
        return None
    if isinstance(v, (np.integer, np.int64, np.int32)):
        return int(v)
    if isinstance(v, (np.floating, np.float64, np.float32)):
        if not np.isfinite(v):
            return None
        return float(v)
    if isinstance(v, np.ndarray):
        return v.tolist()
    if isinstance(v, (pd.Timestamp, np.datetime64)):
        return str(v)
    return v

def clean_record(record):
    return {k: clean_value(v) for k, v in record.items()}

try:
    df = pd.read_parquet(file_path)
    head_df = df.head(limit)
    columns = list(head_df.columns)
    dtypes = {col: str(head_df[col].dtype) for col in columns}
    shape = df.shape

    records = head_df.to_dict('records')
    data = [clean_record(r) for r in records]

    result = {
        "data": data,
        "columns": columns,
        "dtypes": dtypes,
        "shape": [shape[0], shape[1]],
        "nodeType": "DataFrame",
        "cached": True,
        "cachePath": file_path,
    }
    print(json.dumps(result, default=str))
except Exception as e:
    import traceback
    print(json.dumps({
        "error": str(e) + " | " + traceback.format_exc(),
        "data": [],
        "columns": [],
        "dtypes": {},
        "shape": [0, 0],
        "nodeType": "unknown",
        "cached": False,
    }))
`,
    ],
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  });

  const output = await new Response(proc.stdout).text();

  try {
    const result = JSON.parse(output.trim());
    result.cachePath = cachedFile.replace(cwd, "");
    return result;
  } catch (e) {
    return {
      error: `Failed to parse preview: ${output.slice(0, 500)}`,
      data: [],
      columns: [],
      dtypes: {},
      shape: [0, 0],
      nodeType: "unknown",
      cached: false,
    };
  }
}

// ============================================================================
// Node Source Code
// ============================================================================

async function getNodeSourceCode(nodeId: string): Promise<{
  code: string;
  module: string;
  file: string;
  lineNumber: number;
  error?: string;
}> {
  const pythonPath = process.cwd() + "/.venv/bin/python";

  const proc = spawn({
    cmd: [
      pythonPath,
      "-c",
      `
import json
import inspect
import importlib
from pathlib import Path
from hamilton import driver

# Auto-discover modules from scripts/*.py
scripts_dir = Path('scripts')
modules = []
for py_file in scripts_dir.glob('*.py'):
    if py_file.name in ('__init__.py', 'run.py', 'config.py'):
        continue
    module_name = f'scripts.{py_file.stem}'
    try:
        modules.append(importlib.import_module(module_name))
    except ImportError:
        pass

# Auto-discover notebooks
try:
    from scripts.utils.notebook_loader import create_synthetic_module
    for nb_file in scripts_dir.glob('*.ipynb'):
        if '.ipynb_checkpoints' in str(nb_file):
            continue
        module_name = f'scripts.{nb_file.stem}'
        try:
            module = create_synthetic_module(nb_file, module_name)
            if module:
                modules.append(module)
        except Exception:
            pass
except ImportError:
    pass

dr = driver.Builder().with_modules(*modules).build()

node_id = "${nodeId}"
result = {"code": "", "module": "", "file": "", "lineNumber": 0}

if node_id in dr.graph.nodes:
    node = dr.graph.nodes[node_id]
    func = node.callable

    try:
        source = inspect.getsource(func)
        result["code"] = source
        result["module"] = func.__module__

        file_path = inspect.getfile(func)
        result["file"] = file_path

        _, line_num = inspect.getsourcelines(func)
        result["lineNumber"] = line_num
    except (TypeError, OSError) as e:
        result["error"] = str(e)
else:
    result["error"] = f"Node '{node_id}' not found in graph"

print(json.dumps(result))
`,
    ],
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  });

  const output = await new Response(proc.stdout).text();

  try {
    return JSON.parse(output.trim());
  } catch (e) {
    return {
      code: "",
      module: "",
      file: "",
      lineNumber: 0,
      error: `Failed to parse code: ${output.slice(0, 500)}`,
    };
  }
}

// ============================================================================
// HTTP Server
// ============================================================================

async function startServer() {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  server = Bun.serve({
    port: PORT,
    async fetch(req) {
      const url = new URL(req.url);

      if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
      }

      // Health check
      if (url.pathname === "/health") {
        return new Response(
          JSON.stringify({
            status: "ok",
            port: PORT,
            uptime: process.uptime(),
            mode: DEV_MODE ? "development" : "production",
          }),
          { headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      // API Routes
      if (url.pathname.startsWith("/api/")) {
        return handleApiRequest(url, req, corsHeaders);
      }

      // Static files from project (images, etc.)
      if (url.pathname.startsWith("/static/")) {
        const filePath = process.cwd() + url.pathname.replace("/static", "");
        const file = Bun.file(filePath);

        if (await file.exists()) {
          return new Response(file, {
            headers: {
              "Content-Type": getMimeType(filePath),
              "Cache-Control": "public, max-age=3600",
              ...corsHeaders,
            },
          });
        }

        return new Response("Not found", { status: 404, headers: corsHeaders });
      }

      // Serve frontend from dist directory
      let filePath = join(DIST_DIR, url.pathname === "/" ? "index.html" : url.pathname);

      // Check if file exists
      let file = Bun.file(filePath);
      if (!(await file.exists())) {
        // SPA fallback - serve index.html for all non-file routes
        filePath = join(DIST_DIR, "index.html");
        file = Bun.file(filePath);
      }

      if (await file.exists()) {
        return new Response(file, {
          headers: {
            "Content-Type": getMimeType(filePath),
            "Cache-Control": filePath.endsWith(".html") ? "no-cache" : "public, max-age=31536000",
            ...corsHeaders,
          },
        });
      }

      return new Response("Not found", { status: 404, headers: corsHeaders });
    },
    error(error) {
      log("error", `Server error: ${error.message}`);
      return new Response("Internal Server Error", { status: 500 });
    },
  });

  log("info", `Server running at http://localhost:${PORT}`);
}

async function handleApiRequest(
  url: URL,
  req: Request,
  corsHeaders: Record<string, string>
): Promise<Response> {
  try {
    // Environment management
    if (url.pathname === "/api/environments") {
      return new Response(
        JSON.stringify({
          current: currentEnv,
          available: Object.keys(ENVIRONMENTS),
          configs: Object.fromEntries(
            Object.entries(ENVIRONMENTS).map(([k, v]) => [k, { title: v.title, modules: v.modules }])
          ),
        }),
        { headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (url.pathname === "/api/environment" && req.method === "POST") {
      const body = (await req.json()) as { environment: string };
      if (!ENVIRONMENTS[body.environment]) {
        return new Response(JSON.stringify({ error: `Unknown environment: ${body.environment}` }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      currentEnv = body.environment;
      log("info", `Switched to environment: ${currentEnv}`);
      return new Response(
        JSON.stringify({
          success: true,
          environment: currentEnv,
          config: ENVIRONMENTS[currentEnv],
        }),
        { headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Graph data
    if (url.pathname === "/api/graph") {
      const data = await getGraphData();
      updateNodeVizCache(data);
      return new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Visualizations
    if (url.pathname.startsWith("/api/visualizations/")) {
      const nodeId = url.pathname.replace("/api/visualizations/", "");
      const visualizations = await findVisualizations(decodeURIComponent(nodeId));
      return new Response(JSON.stringify(visualizations), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Preview
    if (url.pathname.startsWith("/api/preview/")) {
      const nodeId = decodeURIComponent(url.pathname.replace("/api/preview/", ""));
      const limit = parseInt(url.searchParams.get("limit") || "10");
      const preview = await getCachedDataFramePreview(nodeId, limit);
      return new Response(JSON.stringify(preview), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Code
    if (url.pathname.startsWith("/api/code/")) {
      const nodeId = decodeURIComponent(url.pathname.replace("/api/code/", ""));
      const codeInfo = await getNodeSourceCode(nodeId);
      return new Response(JSON.stringify(codeInfo), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Run pipeline
    if (url.pathname === "/api/run" && req.method === "POST") {
      const body = (await req.json()) as { outputs?: string[]; nodeId?: string };
      const outputs = body.outputs || ["transaction_summary"];
      const nodeId = body.nodeId || outputs[0];

      const jobId = await runPipeline(outputs, nodeId);
      return new Response(JSON.stringify({ jobId, status: "started", nodeId }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // SSE streaming for job logs
    if (url.pathname.match(/^\/api\/job\/[^/]+\/stream$/)) {
      const jobId = url.pathname.split("/")[3];

      const memJob = runningJobs.get(jobId);
      const dbJob = getJob(jobId);

      if (!memJob && !dbJob) {
        return new Response(JSON.stringify({ error: "Job not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      let lastLogId = 0;
      let closed = false;

      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();

          const sendEvent = (event: string, data: any) => {
            if (closed) return;
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
          };

          const job = getJob(jobId);
          if (job) {
            sendEvent("status", {
              status: job.status,
              nodeId: job.node_id,
              startTime: job.start_time,
            });
          }

          const existingLogs = getJobLogs(jobId);
          for (const logEntry of existingLogs) {
            sendEvent("log", {
              id: logEntry.id,
              timestamp: logEntry.timestamp,
              stream: logEntry.stream,
              line: logEntry.line,
            });
            lastLogId = logEntry.id;
          }

          let lastPing = Date.now();
          const PING_INTERVAL = 15000;

          const pollInterval = setInterval(() => {
            if (closed) {
              clearInterval(pollInterval);
              return;
            }

            const now = Date.now();
            if (now - lastPing > PING_INTERVAL) {
              sendEvent("ping", { timestamp: now });
              lastPing = now;
            }

            const newLogs = getJobLogs(jobId, lastLogId);
            for (const logEntry of newLogs) {
              sendEvent("log", {
                id: logEntry.id,
                timestamp: logEntry.timestamp,
                stream: logEntry.stream,
                line: logEntry.line,
              });
              lastLogId = logEntry.id;
            }

            const currentJob = getJob(jobId);
            if (currentJob && currentJob.status !== "running") {
              sendEvent("complete", {
                status: currentJob.status,
                exitCode: currentJob.exit_code,
                endTime: currentJob.end_time,
                duration: currentJob.end_time ? currentJob.end_time - currentJob.start_time : null,
              });
              clearInterval(pollInterval);
              controller.close();
              closed = true;
            }
          }, 100);

          req.signal.addEventListener("abort", () => {
            closed = true;
            clearInterval(pollInterval);
            controller.close();
          });
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          ...corsHeaders,
        },
      });
    }

    // Jobs list
    if (url.pathname === "/api/jobs") {
      const jobs = Array.from(runningJobs.entries()).map(([id, job]) => ({
        id,
        status: job.status,
        elapsed: Date.now() - job.startTime,
        outputCount: job.output.length,
      }));

      return new Response(JSON.stringify({ jobs }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Job status
    if (url.pathname.match(/^\/api\/job\/[^/]+$/) && !url.pathname.endsWith("/stream")) {
      const jobId = url.pathname.replace("/api/job/", "");
      const job = runningJobs.get(jobId);

      if (!job) {
        return new Response(JSON.stringify({ error: "Job not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      return new Response(
        JSON.stringify({
          status: job.status,
          output: job.output,
          elapsed: Date.now() - job.startTime,
        }),
        { headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // History
    if (url.pathname === "/api/history") {
      const nodeId = url.searchParams.get("node") || undefined;
      const status = url.searchParams.get("status") || undefined;
      const limit = parseInt(url.searchParams.get("limit") || "20");
      const offset = parseInt(url.searchParams.get("offset") || "0");

      const result = getHistory({ node_id: nodeId, status, limit, offset });

      return new Response(
        JSON.stringify({
          jobs: result.jobs,
          total: result.total,
          hasMore: offset + result.jobs.length < result.total,
        }),
        { headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Single job from history
    if (
      url.pathname.match(/^\/api\/history\/[^/]+$/) &&
      !url.pathname.endsWith("/logs") &&
      !url.pathname.endsWith("/stats") &&
      !url.pathname.endsWith("/counts")
    ) {
      const jobId = url.pathname.split("/")[3];
      const job = getJob(jobId);

      if (!job) {
        return new Response(JSON.stringify({ error: "Job not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      return new Response(JSON.stringify({ job }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Job logs
    if (url.pathname.match(/^\/api\/history\/[^/]+\/logs$/)) {
      const jobId = url.pathname.split("/")[3];
      const job = getJob(jobId);

      if (!job) {
        return new Response(JSON.stringify({ error: "Job not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const logs = getJobLogs(jobId);

      return new Response(JSON.stringify({ job, logs }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Node stats
    if (url.pathname.match(/^\/api\/history\/[^/]+\/stats$/)) {
      const nodeId = url.pathname.split("/")[3];
      const stats = getNodeStats(nodeId);

      return new Response(JSON.stringify(stats), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // History counts
    if (url.pathname === "/api/history/counts") {
      const counts = getHistoryCountByNode();

      return new Response(JSON.stringify(counts), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Node status
    if (url.pathname === "/api/status") {
      const cwd = process.cwd();
      const statuses: Record<string, { hasCachedData: boolean; hasVisualizations: boolean; vizCount: number }> = {};

      const graphData = await getGraphData();
      updateNodeVizCache(graphData);

      await Promise.all(
        graphData.nodes.map(async (node: any) => {
          const nodeId = node.id;

          let hasCachedData = false;
          const dataPaths = [
            `${cwd}/results/cache/${nodeId}.parquet`,
            `${cwd}/results/${nodeId}.parquet`,
          ];
          for (const dataPath of dataPaths) {
            const dataFile = Bun.file(dataPath);
            if (await dataFile.exists()) {
              hasCachedData = true;
              break;
            }
          }

          let hasVisualizations = false;
          let vizCount = 0;

          // Check for direct PNG file in results/ matching node name (e.g., results/node_name.png)
          const directVizPath = `${cwd}/results/${nodeId}.png`;
          const directVizFile = Bun.file(directVizPath);
          if (await directVizFile.exists()) {
            hasVisualizations = true;
            vizCount = 1;
          }

          // Check convention directory (results/{nodeId}/)
          if (!hasVisualizations) {
            const vizDir = `${cwd}/results/${nodeId}`;
            if (await dirExists(vizDir)) {
              const countProc = spawn({
                cmd: [
                  "sh",
                  "-c",
                  `find "${vizDir}" -maxdepth 2 -type f \\( -name "*.png" -o -name "*.svg" -o -name "*.jpg" \\) 2>/dev/null | wc -l`,
                ],
                stdout: "pipe",
              });
              vizCount = parseInt((await new Response(countProc.stdout).text()).trim()) || 0;
              hasVisualizations = vizCount > 0;
            }
          }

          // Check @viz_output from docstring
          if (!hasVisualizations) {
            const nodeConfig = nodeVizCache.get(nodeId);
            if (nodeConfig?.output_dir) {
              const explicitDir = nodeConfig.output_dir.startsWith("/")
                ? nodeConfig.output_dir
                : `${cwd}/${nodeConfig.output_dir}`;
              if (await dirExists(explicitDir)) {
                const countProc = spawn({
                  cmd: [
                    "sh",
                    "-c",
                    `find "${explicitDir}" -maxdepth 2 -type f \\( -name "*.png" -o -name "*.svg" -o -name "*.jpg" \\) 2>/dev/null | wc -l`,
                  ],
                  stdout: "pipe",
                });
                vizCount = parseInt((await new Response(countProc.stdout).text()).trim()) || 0;
                hasVisualizations = vizCount > 0;
              }
            }
          }

          statuses[nodeId] = { hasCachedData, hasVisualizations, vizCount };
        })
      );

      return new Response(JSON.stringify({ statuses }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Data catalog
    if (url.pathname === "/api/catalog") {
      const catalog = await getDataCatalog();
      return new Response(JSON.stringify({ entries: catalog, total: catalog.length }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // ========================================================================
    // Sync Endpoints
    // ========================================================================

    // Sync status
    if (url.pathname === "/api/sync/status") {
      const client = getSyncClient();
      const status = client.getStatus();
      const recentErrors = client.getRecentErrors(5);
      return new Response(
        JSON.stringify({ ...status, recentErrors }),
        { headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check sync connection
    if (url.pathname === "/api/sync/check" && req.method === "POST") {
      const client = getSyncClient();
      const connected = await client.checkConnection();
      return new Response(
        JSON.stringify({ connected }),
        { headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Manual metadata sync
    if (url.pathname === "/api/sync/metadata" && req.method === "POST") {
      const client = getSyncClient();
      const graphData = await getGraphData();
      const history = getHistory({ limit: 100 });

      const payload = buildMetadataSyncPayload(
        graphData,
        history.jobs,
        client.getStatus().config.projectId,
        client.getStatus().config.projectName
      );

      const result = await client.syncMetadata(payload);
      return new Response(
        JSON.stringify(result),
        { headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Manual data sync
    if (url.pathname === "/api/sync/data" && req.method === "POST") {
      const body = (await req.json()) as { nodeIds?: string[] };
      const client = getSyncClient();

      // If no nodeIds specified, sync all @sync tagged nodes
      let nodeIds = body.nodeIds;
      if (!nodeIds || nodeIds.length === 0) {
        const cacheIndex = loadCacheIndex();
        nodeIds = Object.values(cacheIndex)
          .filter((entry) => entry.shouldSync)
          .map((entry) => entry.nodeId);
      }

      const result = await client.syncDataFiles(nodeIds);
      return new Response(
        JSON.stringify(result),
        { headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Get cache index
    if (url.pathname === "/api/cache") {
      const cacheIndex = loadCacheIndex();
      return new Response(
        JSON.stringify({ entries: Object.values(cacheIndex), total: Object.keys(cacheIndex).length }),
        { headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Get project config
    if (url.pathname === "/api/project") {
      const client = getSyncClient();
      const status = client.getStatus();
      return new Response(
        JSON.stringify({
          projectId: status.config.projectId,
          projectName: status.config.projectName,
          syncEnabled: status.config.enabled,
          motherUrl: status.config.motherUrl,
        }),
        { headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Fallback
    return new Response(
      JSON.stringify({
        message: "PZL-DSS Pipeline API",
        endpoints: [
          "GET /api/graph",
          "GET /api/environments",
          "POST /api/environment",
          "GET /api/visualizations/:nodeId",
          "GET /api/preview/:nodeId",
          "POST /api/run",
          "GET /api/job/:jobId",
          "GET /api/job/:jobId/stream",
          "GET /api/history",
          "GET /api/status",
          "GET /api/catalog",
          "GET /api/sync/status",
          "POST /api/sync/check",
          "POST /api/sync/metadata",
          "POST /api/sync/data",
          "GET /api/cache",
          "GET /api/project",
        ],
      }),
      { headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (e: any) {
    log("error", `API error: ${e.message}`);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
}

// ============================================================================
// Browser Auto-Open
// ============================================================================

async function openBrowser(url: string): Promise<void> {
  if (NO_OPEN) {
    log("info", "Skipping browser auto-open (--no-open flag)");
    return;
  }

  const platform = process.platform;

  try {
    if (platform === "darwin") {
      await $`open ${url}`.quiet();
    } else if (platform === "linux") {
      await $`xdg-open ${url}`.quiet();
    } else if (platform === "win32") {
      await $`start ${url}`.quiet();
    }
    log("info", `Opened browser at ${url}`);
  } catch {
    log("info", `Open ${url} in your browser`);
  }
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main() {
  console.log(`
  ╔════════════════════════════════════════════════════════════╗
  ║         PZL-DSS - Phase Zero Labs Data Science System      ║
  ╚════════════════════════════════════════════════════════════╝
  `);

  setupShutdownHandlers();

  // Kill existing server
  await killExistingServer(PORT);

  // Initialize database
  initDatabase();
  log("info", "Database initialized");

  // Build frontend unless skipped
  if (!SKIP_BUILD) {
    const buildSuccess = await buildFrontend();
    if (!buildSuccess) {
      log("error", "Frontend build failed, exiting");
      process.exit(1);
    }
  } else {
    log("info", "Skipping frontend build (--no-build flag)");
    if (!existsSync(join(DIST_DIR, "index.html"))) {
      log("error", "No built frontend found. Run without --no-build first.");
      process.exit(1);
    }
  }

  // Start server
  await startServer();

  // Auto-open browser
  await openBrowser(`http://localhost:${PORT}`);

  // Watch mode for development
  if (WATCH_MODE) {
    log("info", "Watch mode enabled - rebuilding on changes");

    const watcher = watch(SRC_DIR, { recursive: true }, async (eventType, filename) => {
      if (filename && (filename.endsWith(".tsx") || filename.endsWith(".ts") || filename.endsWith(".css"))) {
        log("info", `File changed: ${filename}, rebuilding...`);
        await buildFrontend();
      }
    });

    process.on("exit", () => watcher.close());
  }

  log("info", `
  Ready! Server running at http://localhost:${PORT}
  ${DEV_MODE ? "Development mode - watching for changes" : "Production mode"}
  ${NO_SYNC ? "Sync disabled" : "Sync enabled"}
  ${NO_CACHE ? "Auto-cache disabled" : "Auto-cache enabled"}
  Press Ctrl+C to stop
  `);
}

main().catch((err) => {
  log("error", `Fatal error: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});

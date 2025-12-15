/**
 * Hamilton Pipeline UI Server - Bun-based
 *
 * A Dagster-style interface for viewing Hamilton DAGs with:
 * - Layered left-to-right layout
 * - Rectangular blocks with tags
 * - Smooth bezier connectors
 * - Module grouping
 *
 * Usage:
 *   bun run scripts/ui/server.ts
 *   # Opens at http://localhost:5050
 *
 * Generalizable: Edit ENVIRONMENTS to point to different Hamilton modules
 */

import { spawn, $ } from "bun";
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
  type Job,
  type LogLine,
} from "./db";

const PORT = 5050;

// Kill any existing process on our port before starting
async function killExistingServer(port: number): Promise<void> {
  try {
    // Use lsof to find process on port and kill it
    const result = await $`lsof -ti :${port}`.quiet();
    const pids = result.stdout.toString().trim().split('\n').filter(Boolean);
    for (const pid of pids) {
      console.log(`Killing existing process on port ${port} (PID: ${pid})`);
      await $`kill ${pid}`.quiet();
    }
    // Small delay to let port be released
    if (pids.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  } catch {
    // No process found on port, or kill failed - that's fine
  }
}

await killExistingServer(PORT);

// Initialize database
initDatabase();
console.log("[server] Database initialized");

interface GraphConfig {
  modules: string[];  // Python module paths to load
  title: string;
  projectPath: string;
  resultsPath: string;  // Where to look for visualizations
}

// Environment configurations - CUSTOMIZE THIS FOR YOUR PROJECT
// Modules are auto-discovered from scripts/*.py files
// Add your own modules here, or leave empty for auto-discovery
const ENVIRONMENTS: Record<string, GraphConfig> = {
  production: {
    modules: [],  // Empty = auto-discover from scripts/*.py
    title: "Your Pipeline",
    projectPath: "ds-template",
    resultsPath: "results",
  },
};

// Current environment - can be switched via API
let currentEnv = "production";

function getConfig(): GraphConfig {
  return ENVIRONMENTS[currentEnv] || ENVIRONMENTS.production;
}

// Get graph data from Python/Hamilton
async function getGraphData(): Promise<any> {
  const config = getConfig();
  const pythonPath = process.cwd() + "/.venv/bin/python";

  // Build dynamic import statement - handle empty modules (auto-discover)
  const hasModules = config.modules.length > 0;

  const moduleImports = hasModules
    ? config.modules.map(m => `import ${m.replace(/\//g, '.')} as ${m.split('.').pop()}`).join('\n')
    : '';

  const moduleList = hasModules
    ? config.modules.map(m => m.split('.').pop()).join(', ')
    : '';

  const proc = spawn({
    cmd: [pythonPath, "-c", `
import json
import importlib
from pathlib import Path
from hamilton import driver

# Auto-discover modules if none specified
${hasModules ? moduleImports : `
# Auto-discover .py files in scripts/
scripts_dir = Path('scripts')
modules = []
for py_file in scripts_dir.glob('*.py'):
    if py_file.name in ('__init__.py', 'run.py', 'config.py'):
        continue
    module_name = f'scripts.{py_file.stem}'
    try:
        modules.append(importlib.import_module(module_name))
    except ImportError as e:
        print(f'Warning: Could not import {module_name}: {e}', file=__import__('sys').stderr)

# Auto-discover .ipynb notebooks with Hamilton functions
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
            print(f'Warning: Could not load notebook {nb_file.name}: {e}', file=__import__('sys').stderr)
except ImportError:
    pass  # nbformat not installed
`}

${hasModules ? `modules = [${moduleList}]` : '# modules already populated by auto-discovery'}

if not modules:
    print(json.dumps({'nodes': [], 'links': [], 'modules': {}, 'maxDepth': 0}))
    exit(0)

dr = driver.Builder().with_modules(*modules).build()

# Auto-detect modules and assign colors
module_colors = ['#0066CC', '#FF9900', '#FF3366', '#4CAF50', '#9333ea', '#06b6d4', '#f43f5e']
detected_modules = {}
color_idx = 0

nodes = []
links = []

for name, node in dr.graph.nodes.items():
    module = 'unknown'
    full_module = ''
    source = 'production'  # Default to production
    is_notebook = False
    notebook_path = None
    if hasattr(node.callable, '__module__'):
        full_module = node.callable.__module__
        module = full_module.split('.')[-1]
        # Determine source based on full module path
        if full_module.startswith('Sandbox'):
            source = 'sandbox'
        elif full_module.startswith('scripts'):
            source = 'production'
        # Check if this is from a notebook
        mod = __import__('sys').modules.get(full_module)
        if mod and getattr(mod, '__notebook__', False):
            is_notebook = True
            notebook_path = getattr(mod, '__notebook_path__', None)

    # Auto-assign colors to new modules
    if module not in detected_modules:
        detected_modules[module] = {
            'color': module_colors[color_idx % len(module_colors)],
            'order': color_idx
        }
        color_idx += 1

    deps = list(node.input_types.keys())

    # Extract tags from docstring
    tags = []
    doc = node.documentation or ''
    doc_lower = doc.lower()

    # Explicit tag patterns (progressive enhancement)
    import re

    # @ignore - skip this node in UI (still runs as dependency)
    if re.search(r'@ignore\\b', doc, re.IGNORECASE):
        continue

    # @asset - mark as data catalog entry
    if re.search(r'@asset(?::\s*([^\n]+))?', doc, re.IGNORECASE):
        tags.append({'label': 'Asset', 'color': '#f59e0b'})

    # @location - hint where data is saved
    if re.search(r'@location:\s*([^\n]+)', doc, re.IGNORECASE):
        tags.append({'label': 'Location', 'color': '#06b6d4'})

    # @viz_output - visualization output (existing, but make explicit)
    if re.search(r'@viz_output:\s*([^\n]+)', doc, re.IGNORECASE):
        tags.append({'label': 'Viz', 'color': '#ec4899'})

    # Keyword-based auto-tags (fallback heuristics)
    if 'postgresql' in doc_lower or 'database' in doc_lower or ('import' in doc_lower and 'from' in doc_lower):
        tags.append({'label': 'DB', 'color': '#3b82f6'})
    if 'download' in doc_lower or 'fetch' in doc_lower or 'http' in doc_lower:
        tags.append({'label': 'External', 'color': '#8b5cf6'})
    if 'parquet' in doc_lower or 'save' in doc_lower:
        tags.append({'label': 'Parquet', 'color': '#22c55e'})
    # Only add Viz from keywords if not already added via @viz_output
    if not any(t['label'] == 'Viz' for t in tags):
        if 'figure' in doc_lower or 'plot' in doc_lower or 'visual' in doc_lower:
            tags.append({'label': 'Viz', 'color': '#ec4899'})

    # Custom tags: @tag: label or @tag: label #hexcolor
    custom_tags = re.findall(r'@tag:\\s*(\\S+)(?:\\s+(#[0-9a-fA-F]{6}))?', doc)
    for label, color in custom_tags:
        tags.append({
            'label': label,
            'color': color if color else '#6b7280'  # default gray
        })

    # Simplify return type
    return_type = str(node.type) if node.type else 'Any'
    if 'DataFrame' in return_type:
        return_type = 'DataFrame'
    elif 'Database' in return_type or 'DataSource' in return_type:
        return_type = 'Connection'
    elif 'Dict' in return_type or 'dict' in return_type:
        return_type = 'Dict'
    elif 'str' in return_type:
        return_type = 'String'
    elif 'Path' in return_type:
        return_type = 'Path'

    nodes.append({
        'id': name,
        'module': module,
        'full_module': full_module,
        'source': source,
        'is_notebook': is_notebook,
        'notebook_path': notebook_path,
        'module_info': detected_modules.get(module, {'color': '#666', 'order': 99}),
        'return_type': return_type,
        'doc': doc[:300] if doc else '',
        'dependencies': deps,
        'tags': tags,
        'dep_count': len(deps),
    })

    for dep in deps:
        links.append({'source': dep, 'target': name})

# Calculate depth (topological layer) for each node
depths = {}
def get_depth(node_id, visited=None):
    if visited is None:
        visited = set()
    if node_id in visited:
        return 0
    visited.add(node_id)
    if node_id in depths:
        return depths[node_id]
    node = next((n for n in nodes if n['id'] == node_id), None)
    if not node or not node['dependencies']:
        depths[node_id] = 0
        return 0
    max_dep = max(get_depth(d, visited.copy()) for d in node['dependencies'])
    depths[node_id] = max_dep + 1
    return depths[node_id]

for node in nodes:
    node['depth'] = get_depth(node['id'])

max_depth = max(n['depth'] for n in nodes) if nodes else 0

# Sort modules by their typical appearance order
module_order = sorted(detected_modules.keys(), key=lambda m: detected_modules[m]['order'])

print(json.dumps({
    'nodes': nodes,
    'links': links,
    'modules': detected_modules,
    'module_order': module_order,
    'max_depth': max_depth,
    'title': '${config.title}',
    'project': '${config.projectPath}',
    'environment': '${currentEnv}',
}))
`],
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  });

  const output = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();

  if (stderr && !stderr.includes('Note: Hamilton collects')) {
    console.error("Python stderr:", stderr);
  }

  try {
    return JSON.parse(output.trim());
  } catch (e) {
    console.error("Failed to parse:", output.slice(0, 500));
    throw new Error(`Failed to parse graph data: ${e}`);
  }
}


// Visualization output configuration
// Nodes can define their output paths via:
//   1. @viz_output tag in docstring: "@viz_output: Sandbox/results/my_node"
//   2. Convention: Sandbox/results/{node_name}/ is auto-discovered
//   3. Return type Path: If node returns Path, we look for images there

interface NodeVizConfig {
  output_dir?: string;  // Explicit output directory from docstring
  return_type?: string; // Node's return type
}

// Cache for node visualization configs (extracted from graph data)
let nodeVizCache: Map<string, NodeVizConfig> = new Map();

// Update cache when graph is loaded
function updateNodeVizCache(graphData: any) {
  nodeVizCache.clear();
  for (const node of graphData.nodes || []) {
    const config: NodeVizConfig = {
      return_type: node.return_type,
    };

    // Parse @viz_output from docstring
    const doc = node.doc || '';
    const vizMatch = doc.match(/@viz_output:\s*([^\n]+)/i);
    if (vizMatch) {
      config.output_dir = vizMatch[1].trim();
    }

    nodeVizCache.set(node.id, config);
  }
}

// Find all images recursively in a directory (with depth limit)
// Only returns PNG files for UI display (SVGs are still saved but not shown)
async function findImagesInDir(dir: string, maxDepth: number = 3): Promise<string[]> {
  try {
    const proc = spawn({
      cmd: ['find', dir, '-maxdepth', String(maxDepth), '-type', 'f', '-name', '*.png'],
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const output = await new Response(proc.stdout).text();
    return output.trim().split('\n').filter(f => f && !f.includes('/.'));
  } catch {
    return [];
  }
}

// Check if directory exists
async function dirExists(path: string): Promise<boolean> {
  try {
    const proc = spawn({ cmd: ['test', '-d', path] });
    await proc.exited;
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

// Find visualizations for a node using smart discovery
async function findVisualizations(nodeId: string): Promise<{images: string[], parquets: string[], totalAvailable: number, outputDir?: string}> {
  const images: string[] = [];
  const parquets: string[] = [];
  let totalAvailable = 0;
  let outputDir: string | undefined;

  const cwd = process.cwd();
  const nodeConfig = nodeVizCache.get(nodeId);

  // Priority 1: Explicit @viz_output from docstring
  if (nodeConfig?.output_dir) {
    const explicitDir = nodeConfig.output_dir.startsWith('/')
      ? nodeConfig.output_dir
      : `${cwd}/${nodeConfig.output_dir}`;

    if (await dirExists(explicitDir)) {
      outputDir = nodeConfig.output_dir;
      const found = await findImagesInDir(explicitDir);
      totalAvailable = found.length;
      for (const f of found.slice(0, 24)) {
        images.push(f.replace(cwd, ''));
      }
    }
  }

  // Priority 2: Convention - Sandbox/results/{node_name}/
  if (images.length === 0) {
    const conventionDir = `${cwd}/Sandbox/results/${nodeId}`;
    if (await dirExists(conventionDir)) {
      outputDir = `Sandbox/results/${nodeId}`;
      const found = await findImagesInDir(conventionDir);
      totalAvailable = found.length;
      for (const f of found.slice(0, 24)) {
        images.push(f.replace(cwd, ''));
      }
    }
  }

  // Priority 3: Check if node name matches a results subdirectory
  if (images.length === 0) {
    const resultsDir = `${cwd}/Sandbox/results`;
    try {
      const proc = spawn({ cmd: ['ls', '-1', resultsDir], stdout: 'pipe', stderr: 'pipe' });
      const output = await new Response(proc.stdout).text();
      const subdirs = output.trim().split('\n').filter(d => d && !d.startsWith('.'));

      // Find subdirs that match node name pattern
      const nodeIdLower = nodeId.toLowerCase();
      for (const subdir of subdirs) {
        const subdirLower = subdir.toLowerCase();
        // Match if node name contains subdir name or vice versa
        if (nodeIdLower.includes(subdirLower) || subdirLower.includes(nodeIdLower.replace(/_/g, ''))) {
          const matchDir = `${resultsDir}/${subdir}`;
          if (await dirExists(matchDir)) {
            outputDir = `Sandbox/results/${subdir}`;
            const found = await findImagesInDir(matchDir);
            totalAvailable += found.length;
            for (const f of found.slice(0, 24 - images.length)) {
              if (!images.includes(f.replace(cwd, ''))) {
                images.push(f.replace(cwd, ''));
              }
            }
          }
        }
      }
    } catch {}
  }

  // Priority 4: Check data/ directory for parquet files matching node name
  const dataDir = `${cwd}/data`;
  try {
    const parquetProc = spawn({
      cmd: ['find', dataDir, '-maxdepth', '2', '-type', 'f', '-name', `*${nodeId}*.parquet`],
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const parquetOutput = await new Response(parquetProc.stdout).text();
    const parquetFiles = parquetOutput.trim().split('\n').filter(f => f);
    for (const file of parquetFiles.slice(0, 5)) {
      parquets.push(file.replace(cwd, ''));
    }
  } catch {}

  // Sort images - prioritize "combined" images and most recent
  images.sort((a, b) => {
    const aIsCombined = a.includes('combined');
    const bIsCombined = b.includes('combined');
    if (aIsCombined && !bIsCombined) return -1;
    if (!aIsCombined && bIsCombined) return 1;
    return b.localeCompare(a); // Reverse alphabetical (newer timestamps first)
  });

  return {
    images: images.slice(0, 24),
    parquets,
    totalAvailable,
    outputDir,
  };
}

// Get MIME type for file extension
function getMimeType(path: string): string {
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.svg')) return 'image/svg+xml';
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
  if (path.endsWith('.gif')) return 'image/gif';
  if (path.endsWith('.webp')) return 'image/webp';
  return 'application/octet-stream';
}

// Track running pipeline jobs
const runningJobs: Map<string, { status: string; output: string[]; startTime: number; }> = new Map();

// Data Catalog types and functions
interface CatalogEntry {
  id: string;
  name: string;
  type: 'parquet' | 'csv' | 'images' | 'mixed';
  path: string;
  fileCount: number;
  totalSize: string;
  lastModified: string;
  description?: string;
  tags: string[];
  columns?: string[];
  rowCount?: number;
  sampleImages?: string[];
}

// Get file size in human readable format
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Get data catalog entries
async function getDataCatalog(): Promise<CatalogEntry[]> {
  const entries: CatalogEntry[] = [];
  const cwd = process.cwd();

  // Scan Sandbox/results for visualization outputs
  const resultsDir = `${cwd}/Sandbox/results`;
  try {
    const proc = spawn({
      cmd: ['ls', '-1', resultsDir],
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const output = await new Response(proc.stdout).text();
    const subdirs = output.trim().split('\n').filter(d => d && !d.startsWith('.'));

    for (const subdir of subdirs) {
      const fullPath = `${resultsDir}/${subdir}`;

      // Get file stats
      const statProc = spawn({
        cmd: ['sh', '-c', `find "${fullPath}" -type f 2>/dev/null | head -500 | xargs ls -la 2>/dev/null | tail -n +1`],
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const statOutput = await new Response(statProc.stdout).text();
      const files = statOutput.trim().split('\n').filter(l => l);

      // Count file types
      let pngCount = 0, svgCount = 0, parquetCount = 0, csvCount = 0;
      let totalBytes = 0;
      let latestDate = '';
      const sampleImages: string[] = [];

      const fileCountProc = spawn({
        cmd: ['sh', '-c', `find "${fullPath}" -type f -name "*.png" 2>/dev/null | wc -l`],
        stdout: 'pipe',
      });
      pngCount = parseInt((await new Response(fileCountProc.stdout).text()).trim()) || 0;

      const svgCountProc = spawn({
        cmd: ['sh', '-c', `find "${fullPath}" -type f -name "*.svg" 2>/dev/null | wc -l`],
        stdout: 'pipe',
      });
      svgCount = parseInt((await new Response(svgCountProc.stdout).text()).trim()) || 0;

      const parquetCountProc = spawn({
        cmd: ['sh', '-c', `find "${fullPath}" -type f -name "*.parquet" 2>/dev/null | wc -l`],
        stdout: 'pipe',
      });
      parquetCount = parseInt((await new Response(parquetCountProc.stdout).text()).trim()) || 0;

      const csvCountProc = spawn({
        cmd: ['sh', '-c', `find "${fullPath}" -type f -name "*.csv" 2>/dev/null | wc -l`],
        stdout: 'pipe',
      });
      csvCount = parseInt((await new Response(csvCountProc.stdout).text()).trim()) || 0;

      // Get total size
      const sizeProc = spawn({
        cmd: ['sh', '-c', `du -sb "${fullPath}" 2>/dev/null | cut -f1`],
        stdout: 'pipe',
      });
      totalBytes = parseInt((await new Response(sizeProc.stdout).text()).trim()) || 0;

      // Get latest modification date
      const dateProc = spawn({
        cmd: ['sh', '-c', `find "${fullPath}" -type f -exec stat -f "%m %N" {} + 2>/dev/null | sort -rn | head -1 | cut -d' ' -f1`],
        stdout: 'pipe',
      });
      const latestTimestamp = parseInt((await new Response(dateProc.stdout).text()).trim()) || 0;
      if (latestTimestamp) {
        latestDate = new Date(latestTimestamp * 1000).toISOString().split('T')[0];
      }

      // Get sample images
      const sampleProc = spawn({
        cmd: ['sh', '-c', `find "${fullPath}" -type f -name "*.png" 2>/dev/null | head -4`],
        stdout: 'pipe',
      });
      const sampleOutput = await new Response(sampleProc.stdout).text();
      for (const img of sampleOutput.trim().split('\n').filter(f => f)) {
        sampleImages.push(img.replace(cwd, ''));
      }

      // Determine type
      let type: CatalogEntry['type'] = 'mixed';
      if (parquetCount > 0 && pngCount === 0 && svgCount === 0) type = 'parquet';
      else if (csvCount > 0 && parquetCount === 0 && pngCount === 0) type = 'csv';
      else if ((pngCount > 0 || svgCount > 0) && parquetCount === 0) type = 'images';

      // Generate tags
      const tags: string[] = [];
      if (pngCount > 0) tags.push('PNG');
      if (svgCount > 0) tags.push('SVG');
      if (parquetCount > 0) tags.push('Parquet');
      if (csvCount > 0) tags.push('CSV');

      const fileCount = pngCount + svgCount + parquetCount + csvCount;
      if (fileCount > 0) {
        entries.push({
          id: subdir,
          name: subdir.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          type,
          path: `Sandbox/results/${subdir}`,
          fileCount,
          totalSize: formatFileSize(totalBytes),
          lastModified: latestDate,
          tags,
          sampleImages: sampleImages.slice(0, 4),
        });
      }
    }
  } catch (e) {
    console.error('Error scanning results:', e);
  }

  // Scan data/ directory for parquet files
  const dataDir = `${cwd}/data`;
  try {
    const proc = spawn({
      cmd: ['sh', '-c', `find "${dataDir}" -name "*.parquet" -type f 2>/dev/null`],
      stdout: 'pipe',
    });
    const output = await new Response(proc.stdout).text();
    const parquetFiles = output.trim().split('\n').filter(f => f);

    // Group by subdirectory
    const bySubdir: Record<string, string[]> = {};
    for (const file of parquetFiles) {
      const rel = file.replace(dataDir + '/', '');
      const parts = rel.split('/');
      const subdir = parts.length > 1 ? parts[0] : 'root';
      if (!bySubdir[subdir]) bySubdir[subdir] = [];
      bySubdir[subdir].push(file);
    }

    for (const [subdir, files] of Object.entries(bySubdir)) {
      // Get total size
      let totalBytes = 0;
      for (const file of files) {
        const sizeProc = spawn({ cmd: ['stat', '-f', '%z', file], stdout: 'pipe' });
        totalBytes += parseInt((await new Response(sizeProc.stdout).text()).trim()) || 0;
      }

      // Get columns from first parquet file using Python
      let columns: string[] = [];
      let rowCount = 0;
      if (files.length > 0) {
        const pythonPath = process.cwd() + "/.venv/bin/python";
        const colProc = spawn({
          cmd: [pythonPath, '-c', `
import pandas as pd
import json
try:
    df = pd.read_parquet("${files[0]}")
    print(json.dumps({"columns": list(df.columns)[:20], "rows": len(df)}))
except:
    print(json.dumps({"columns": [], "rows": 0}))
`],
          stdout: 'pipe',
          stderr: 'pipe',
        });
        try {
          const colOutput = await new Response(colProc.stdout).text();
          const parsed = JSON.parse(colOutput.trim());
          columns = parsed.columns;
          rowCount = parsed.rows;
        } catch {}
      }

      entries.push({
        id: `data-${subdir}`,
        name: `Data: ${subdir.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`,
        type: 'parquet',
        path: `data/${subdir}`,
        fileCount: files.length,
        totalSize: formatFileSize(totalBytes),
        lastModified: '',
        tags: ['Parquet', 'Data'],
        columns,
        rowCount,
      });
    }
  } catch (e) {
    console.error('Error scanning data:', e);
  }

  // Sort by last modified (most recent first), then by file count
  entries.sort((a, b) => {
    if (a.lastModified && b.lastModified) {
      return b.lastModified.localeCompare(a.lastModified);
    }
    return b.fileCount - a.fileCount;
  });

  return entries;
}

// Get cached DataFrame preview for a node (does NOT execute the pipeline)
// Only reads from existing parquet files in data/ directory
async function getCachedDataFramePreview(nodeId: string, limit: number = 10): Promise<{
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

  // Search for cached parquet files matching the node name
  // Look in results/, data/, and Sandbox/results/ directories
  const searchDirs = [
    `${cwd}/results`,
    `${cwd}/data`,
    `${cwd}/Sandbox/results`,
  ];

  let cachedFile: string | null = null;

  for (const dir of searchDirs) {
    try {
      // Look for exact match first
      const exactMatch = `${dir}/${nodeId}.parquet`;
      const exactFile = Bun.file(exactMatch);
      if (await exactFile.exists()) {
        cachedFile = exactMatch;
        break;
      }

      // Then look for files containing the node name
      const proc = spawn({
        cmd: ['find', dir, '-maxdepth', '3', '-type', 'f', '-name', '*.parquet'],
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const output = await new Response(proc.stdout).text();
      const files = output.trim().split('\n').filter(f => f);

      // Find best match - prefer exact filename match, then contains
      for (const file of files) {
        const filename = file.split('/').pop()?.replace('.parquet', '') || '';
        if (filename === nodeId) {
          cachedFile = file;
          break;
        }
      }

      if (!cachedFile) {
        // Try contains match
        for (const file of files) {
          const filename = file.split('/').pop()?.replace('.parquet', '') || '';
          if (filename.includes(nodeId) || nodeId.includes(filename)) {
            cachedFile = file;
            break;
          }
        }
      }

      if (cachedFile) break;
    } catch {
      // Continue to next directory
    }
  }

  if (!cachedFile) {
    return {
      data: [],
      columns: [],
      dtypes: {},
      shape: [0, 0],
      nodeType: 'unknown',
      cached: false,
      error: 'No cached data found. Run this node first to generate data.',
    };
  }

  // Read the parquet file using Python
  const proc = spawn({
    cmd: [pythonPath, "-c", `
import json
import pandas as pd
import numpy as np

file_path = "${cachedFile}"
limit = ${limit}

def clean_value(v):
    """Convert value to JSON-safe type."""
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
    """Clean all values in a dictionary."""
    return {k: clean_value(v) for k, v in record.items()}

try:
    df = pd.read_parquet(file_path)
    head_df = df.head(limit)
    columns = list(head_df.columns)
    dtypes = {col: str(head_df[col].dtype) for col in columns}
    shape = df.shape

    # Convert to records and clean each value
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
`],
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  });

  const output = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();

  if (stderr) {
    console.error("Preview stderr:", stderr);
  }

  try {
    const result = JSON.parse(output.trim());
    result.cachePath = cachedFile.replace(cwd, '');
    return result;
  } catch (e) {
    return {
      error: `Failed to parse preview: ${output.slice(0, 500)}`,
      data: [],
      columns: [],
      dtypes: {},
      shape: [0, 0],
      nodeType: 'unknown',
      cached: false,
    };
  }
}

// Get source code for a Hamilton node
async function getNodeSourceCode(nodeId: string): Promise<{
  code: string;
  module: string;
  file: string;
  lineNumber: number;
  error?: string;
}> {
  const config = getConfig();
  const pythonPath = process.cwd() + "/.venv/bin/python";
  const moduleList = config.modules.map(m => m.split('.').pop()).join(', ');

  const proc = spawn({
    cmd: [pythonPath, "-c", `
import json
import inspect
from hamilton import driver

# Dynamic imports based on config
${config.modules.map(m => `import ${m.replace(/\//g, '.')} as ${m.split('.').pop()}`).join('\n')}

modules = [${moduleList}]
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

        # Get file info
        file_path = inspect.getfile(func)
        result["file"] = file_path

        # Get line number
        _, line_num = inspect.getsourcelines(func)
        result["lineNumber"] = line_num
    except (TypeError, OSError) as e:
        result["error"] = str(e)
else:
    result["error"] = f"Node '{node_id}' not found in graph"

print(json.dumps(result))
`],
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  });

  const output = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();

  if (stderr && !stderr.includes('Note: Hamilton collects')) {
    console.error("Code fetch stderr:", stderr);
  }

  try {
    return JSON.parse(output.trim());
  } catch (e) {
    return {
      code: '',
      module: '',
      file: '',
      lineNumber: 0,
      error: `Failed to parse code: ${output.slice(0, 500)}`,
    };
  }
}

// Run pipeline for specific outputs
async function runPipeline(outputs: string[], nodeId: string): Promise<string> {
  const jobId = `job-${Date.now()}`;
  const pythonPath = process.cwd() + "/.venv/bin/python";
  const config = getConfig();
  const moduleList = config.modules.map(m => m.split('.').pop()).join(', ');

  // Insert job into database
  insertJob({ id: jobId, node_id: nodeId, status: 'running' });

  // Also keep in memory for backward compatibility
  runningJobs.set(jobId, {
    status: 'running',
    output: [`Starting pipeline for outputs: ${outputs.join(', ')}`],
    startTime: Date.now(),
  });

  // Log first line to DB
  insertLog({ job_id: jobId, stream: 'stdout', line: `Starting pipeline for outputs: ${outputs.join(', ')}` });

  const outputArgs = outputs.map(o => `"${o}"`).join(', ');

  const proc = spawn({
    cmd: [pythonPath, "-c", `
import sys
import json
from pathlib import Path

# Ensure output directories exist
dirs = ["results/raw", "results/integrated", "results/figures"]
for d in dirs:
    Path(d).mkdir(parents=True, exist_ok=True)

# Build and run Hamilton driver
from hamilton import driver
${config.modules.map(m => `import ${m.replace(/\//g, '.')} as ${m.split('.').pop()}`).join('\n')}

print(f"Building Hamilton driver...", flush=True)
dr = driver.Builder().with_modules(${moduleList}).build()

outputs = [${outputArgs}]
print(f"Executing pipeline for: {outputs}", flush=True)

try:
    results = dr.execute(final_vars=outputs)
    print(f"\\nPipeline complete!", flush=True)
    for name, result in results.items():
        if hasattr(result, 'shape'):
            print(f"  {name}: {result.shape[0]:,} rows x {result.shape[1]} cols", flush=True)
        elif isinstance(result, dict):
            print(f"  {name}: {result}", flush=True)
    print(json.dumps({"status": "success", "outputs": list(results.keys())}))
except Exception as e:
    print(f"Error: {e}", flush=True)
    import traceback
    traceback.print_exc()
    print(json.dumps({"status": "error", "message": str(e)}))
`],
    cwd: process.cwd(),
    stdout: 'pipe',
    stderr: 'pipe',
  });

  // Capture output in real-time
  const job = runningJobs.get(jobId)!;

  // Process stdout
  (async () => {
    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      text.split('\n').filter(l => l.trim()).forEach(line => {
        job.output.push(line);
        // Write to database
        insertLog({ job_id: jobId, stream: 'stdout', line });
      });
    }
  })();

  // Process stderr
  (async () => {
    const reader = proc.stderr.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      if (!text.includes('Note: Hamilton collects')) {
        text.split('\n').filter(l => l.trim()).forEach(line => {
          job.output.push(`[stderr] ${line}`);
          // Write to database
          insertLog({ job_id: jobId, stream: 'stderr', line });
        });
      }
    }
  })();

  // Wait for completion
  proc.exited.then((exitCode) => {
    const lastLine = job.output[job.output.length - 1] || '';
    let finalStatus: 'completed' | 'failed' = 'completed';
    let errorMessage: string | undefined;

    try {
      const result = JSON.parse(lastLine);
      finalStatus = result.status === 'success' ? 'completed' : 'failed';
      if (result.status !== 'success') {
        errorMessage = result.message;
      }
    } catch {
      finalStatus = 'completed';
    }

    job.status = finalStatus;

    // Update database
    updateJob(jobId, {
      status: finalStatus,
      exit_code: exitCode,
      error_message: errorMessage,
    });
  }).catch((err) => {
    job.status = 'failed';
    updateJob(jobId, {
      status: 'failed',
      error_message: String(err),
    });
  });

  return jobId;
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // CORS headers for React dev server
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Health check endpoint for CLI auto-start detection
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', port: PORT }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // Environment management endpoints
    if (url.pathname === '/api/environments') {
      return new Response(JSON.stringify({
        current: currentEnv,
        available: Object.keys(ENVIRONMENTS),
        configs: Object.fromEntries(
          Object.entries(ENVIRONMENTS).map(([k, v]) => [k, { title: v.title, modules: v.modules }])
        ),
      }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    if (url.pathname === '/api/environment' && req.method === 'POST') {
      try {
        const body = await req.json() as { environment: string };
        if (!ENVIRONMENTS[body.environment]) {
          return new Response(JSON.stringify({ error: `Unknown environment: ${body.environment}` }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        currentEnv = body.environment;
        console.log(`Switched to environment: ${currentEnv}`);
        return new Response(JSON.stringify({
          success: true,
          environment: currentEnv,
          config: ENVIRONMENTS[currentEnv]
        }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    if (url.pathname === '/api/graph') {
      try {
        const data = await getGraphData();
        // Update viz cache when graph is loaded
        updateNodeVizCache(data);
        return new Response(JSON.stringify(data), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // Get visualizations for a specific node
    if (url.pathname.startsWith('/api/visualizations/')) {
      const nodeId = url.pathname.replace('/api/visualizations/', '');
      try {
        const visualizations = await findVisualizations(decodeURIComponent(nodeId));
        return new Response(JSON.stringify(visualizations), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message, images: [], parquets: [] }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // Preview DataFrame for a node (only from cached parquet files - does NOT execute pipeline)
    if (url.pathname.startsWith('/api/preview/')) {
      const nodeId = decodeURIComponent(url.pathname.replace('/api/preview/', ''));
      const limit = parseInt(url.searchParams.get('limit') || '10');

      try {
        const preview = await getCachedDataFramePreview(nodeId, limit);
        return new Response(JSON.stringify(preview), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message, cached: false }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // Get source code for a node
    if (url.pathname.startsWith('/api/code/')) {
      const nodeId = decodeURIComponent(url.pathname.replace('/api/code/', ''));
      try {
        const codeInfo = await getNodeSourceCode(nodeId);
        return new Response(JSON.stringify(codeInfo), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // Run pipeline for specific outputs
    if (url.pathname === '/api/run' && req.method === 'POST') {
      try {
        const body = await req.json() as { outputs?: string[]; nodeId?: string };
        const outputs = body.outputs || ['transaction_summary'];
        const nodeId = body.nodeId || outputs[0]; // Use first output as nodeId if not specified

        const jobId = await runPipeline(outputs, nodeId);
        return new Response(JSON.stringify({ jobId, status: 'started', nodeId }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // SSE streaming endpoint for job logs (must be checked BEFORE the generic /api/job/ handler)
    if (url.pathname.match(/^\/api\/job\/[^/]+\/stream$/)) {
      const jobId = url.pathname.split('/')[3];

      // Check if job exists (in memory or DB)
      const memJob = runningJobs.get(jobId);
      const dbJob = getJob(jobId);

      if (!memJob && !dbJob) {
        return new Response(JSON.stringify({ error: 'Job not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // Create SSE stream
      let lastLogId = 0;
      let closed = false;

      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();

          const sendEvent = (event: string, data: any) => {
            if (closed) return;
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
          };

          // Send initial status
          const job = getJob(jobId);
          if (job) {
            sendEvent('status', {
              status: job.status,
              nodeId: job.node_id,
              startTime: job.start_time,
            });
          }

          // Send existing logs first
          const existingLogs = getJobLogs(jobId);
          for (const log of existingLogs) {
            sendEvent('log', {
              id: log.id,
              timestamp: log.timestamp,
              stream: log.stream,
              line: log.line,
            });
            lastLogId = log.id;
          }

          // Send keep-alive ping every 15 seconds to prevent connection timeout
          let lastPing = Date.now();
          const PING_INTERVAL = 15000;

          // Poll for new logs
          const pollInterval = setInterval(() => {
            if (closed) {
              clearInterval(pollInterval);
              return;
            }

            // Send keep-alive ping if needed
            const now = Date.now();
            if (now - lastPing > PING_INTERVAL) {
              sendEvent('ping', { timestamp: now });
              lastPing = now;
            }

            // Get new logs since lastLogId
            const newLogs = getJobLogs(jobId, lastLogId);
            for (const log of newLogs) {
              sendEvent('log', {
                id: log.id,
                timestamp: log.timestamp,
                stream: log.stream,
                line: log.line,
              });
              lastLogId = log.id;
            }

            // Check job status
            const currentJob = getJob(jobId);
            if (currentJob && currentJob.status !== 'running') {
              sendEvent('complete', {
                status: currentJob.status,
                exitCode: currentJob.exit_code,
                endTime: currentJob.end_time,
                duration: currentJob.end_time ? currentJob.end_time - currentJob.start_time : null,
              });
              clearInterval(pollInterval);
              controller.close();
              closed = true;
            }
          }, 100); // Poll every 100ms for near-realtime

          // Handle client disconnect
          req.signal.addEventListener('abort', () => {
            closed = true;
            clearInterval(pollInterval);
            controller.close();
          });
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          ...corsHeaders,
        },
      });
    }

    // List all jobs (in-memory)
    if (url.pathname === '/api/jobs') {
      const jobs = Array.from(runningJobs.entries()).map(([id, job]) => ({
        id,
        status: job.status,
        elapsed: Date.now() - job.startTime,
        outputCount: job.output.length,
      }));

      return new Response(JSON.stringify({ jobs }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // Get job status and output (must be AFTER /stream endpoint)
    if (url.pathname.match(/^\/api\/job\/[^/]+$/) && !url.pathname.endsWith('/stream')) {
      const jobId = url.pathname.replace('/api/job/', '');
      const job = runningJobs.get(jobId);

      if (!job) {
        return new Response(JSON.stringify({ error: 'Job not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      return new Response(JSON.stringify({
        status: job.status,
        output: job.output,
        elapsed: Date.now() - job.startTime,
      }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // Get job history (from database)
    if (url.pathname === '/api/history') {
      const nodeId = url.searchParams.get('node') || undefined;
      const status = url.searchParams.get('status') || undefined;
      const limit = parseInt(url.searchParams.get('limit') || '20');
      const offset = parseInt(url.searchParams.get('offset') || '0');

      const result = getHistory({ node_id: nodeId, status, limit, offset });

      return new Response(JSON.stringify({
        jobs: result.jobs,
        total: result.total,
        hasMore: offset + result.jobs.length < result.total,
      }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // Get a single job by ID (for CLI polling)
    if (url.pathname.match(/^\/api\/history\/[^/]+$/) && !url.pathname.endsWith('/logs') && !url.pathname.endsWith('/stats') && !url.pathname.endsWith('/counts')) {
      const jobId = url.pathname.split('/')[3];
      const job = getJob(jobId);

      if (!job) {
        return new Response(JSON.stringify({ error: 'Job not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      return new Response(JSON.stringify({ job }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // Get logs for a historical job
    if (url.pathname.match(/^\/api\/history\/[^/]+\/logs$/)) {
      const jobId = url.pathname.split('/')[3];
      const job = getJob(jobId);

      if (!job) {
        return new Response(JSON.stringify({ error: 'Job not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      const logs = getJobLogs(jobId);

      return new Response(JSON.stringify({
        job,
        logs,
      }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // Get execution stats for a node
    if (url.pathname.match(/^\/api\/history\/[^/]+\/stats$/)) {
      const nodeId = url.pathname.split('/')[3];
      const stats = getNodeStats(nodeId);

      return new Response(JSON.stringify(stats), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // Get history count per node (for badges)
    if (url.pathname === '/api/history/counts') {
      const counts = getHistoryCountByNode();

      return new Response(JSON.stringify(counts), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // Node status endpoint - bulk status check for all nodes
    if (url.pathname === '/api/status') {
      try {
        const cwd = process.cwd();
        const statuses: Record<string, { hasCachedData: boolean; hasVisualizations: boolean; vizCount: number }> = {};

        // Get all node IDs from the graph cache (or from a simple list)
        // For each node, do lightweight existence checks
        const graphData = await getGraphData();
        updateNodeVizCache(graphData);

        await Promise.all(graphData.nodes.map(async (node: any) => {
          const nodeId = node.id;

          // Check for cached data (search in data/ and results/ subdirectories)
          let hasCachedData = false;
          // Check Hamilton pipeline output directories (results/)
          const dataPaths = [
            `${cwd}/results/raw/${nodeId}.parquet`,
            `${cwd}/results/integrated/${nodeId}.parquet`,
            `${cwd}/results/figures/${nodeId}.parquet`,
          ];
          for (const dataPath of dataPaths) {
            const dataFile = Bun.file(dataPath);
            if (await dataFile.exists()) {
              hasCachedData = true;
              break;
            }
          }

          // Check for visualizations (directory existence + quick file count)
          let hasVisualizations = false;
          let vizCount = 0;

          // Check convention directory first
          const vizDir = `${cwd}/Sandbox/results/${nodeId}`;
          if (await dirExists(vizDir)) {
            const countProc = spawn({
              cmd: ['sh', '-c', `find "${vizDir}" -maxdepth 2 -type f \\( -name "*.png" -o -name "*.svg" -o -name "*.jpg" \\) 2>/dev/null | wc -l`],
              stdout: 'pipe',
            });
            vizCount = parseInt((await new Response(countProc.stdout).text()).trim()) || 0;
            hasVisualizations = vizCount > 0;
          }

          // Also check @viz_output from docstring
          if (!hasVisualizations) {
            const nodeConfig = nodeVizCache.get(nodeId);
            if (nodeConfig?.output_dir) {
              const explicitDir = nodeConfig.output_dir.startsWith('/')
                ? nodeConfig.output_dir
                : `${cwd}/${nodeConfig.output_dir}`;
              if (await dirExists(explicitDir)) {
                const countProc = spawn({
                  cmd: ['sh', '-c', `find "${explicitDir}" -maxdepth 2 -type f \\( -name "*.png" -o -name "*.svg" -o -name "*.jpg" \\) 2>/dev/null | wc -l`],
                  stdout: 'pipe',
                });
                vizCount = parseInt((await new Response(countProc.stdout).text()).trim()) || 0;
                hasVisualizations = vizCount > 0;
              }
            }
          }

          statuses[nodeId] = { hasCachedData, hasVisualizations, vizCount };
        }));

        return new Response(JSON.stringify({ statuses }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message, statuses: {} }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // Data Catalog API
    if (url.pathname === '/api/catalog') {
      try {
        const catalog = await getDataCatalog();
        return new Response(JSON.stringify({ entries: catalog, total: catalog.length }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message, entries: [] }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // Serve static files (images from results directories)
    if (url.pathname.startsWith('/static/')) {
      const filePath = process.cwd() + url.pathname.replace('/static', '');
      const file = Bun.file(filePath);

      if (await file.exists()) {
        return new Response(file, {
          headers: {
            'Content-Type': getMimeType(filePath),
            'Cache-Control': 'public, max-age=3600',
            ...corsHeaders
          }
        });
      }

      return new Response('Not found', { status: 404, headers: corsHeaders });
    }

    // API-only server - no UI served here
    // Use React app at localhost:5173 for UI
    return new Response(JSON.stringify({
      message: 'Hamilton Pipeline API Server',
      endpoints: [
        'GET /api/graph - Get DAG structure',
        'GET /api/environments - List environments',
        'POST /api/environment - Switch environment',
        'GET /api/visualizations/:nodeId - Get visualizations for a node',
        'GET /api/preview/:nodeId - Preview DataFrame data',
        'POST /api/run - Run pipeline',
        'GET /api/job/:jobId - Get job status',
        'GET /api/jobs - List all jobs',
        'GET /static/* - Serve result files',
      ],
      ui: 'http://localhost:5173',
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  },
});

console.log(`Hamilton Pipeline UI running at http://localhost:${server.port}`);

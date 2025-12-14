---
name: dss
description: Promote validated code from Sandbox to production DSS (Data Science System) pipeline. Use when user says code is ready for production, asks to "promote" work, or wants to integrate with the pipeline.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# DSS Pipeline Promotion Skill

This skill guides the promotion of validated Sandbox code to production DSS (Data Science System) modules. DSS uses Hamilton under the hood as its DAG execution engine.

## When to Use This Skill

Use this skill when:
- User says experimental code is "ready for production"
- User asks to "promote" Sandbox work to DSS
- Creating new pipeline nodes
- Integrating visualization outputs with the DSS UI
- User wants to add nodes to the DAG

## DSS Architecture Overview

```
scripts/
├── run.py              # CLI driver
├── *.py                # Python modules (auto-discovered)
├── *.ipynb             # Jupyter notebooks (auto-discovered)
├── utils/              # Shared utilities
│   ├── data_source.py  # DataSource protocol
│   ├── visualization.py # AGC styling
│   └── notebook_loader.py # Notebook function extraction
└── ui/                 # Interactive UI
    ├── server.ts       # Bun API server (port 5050)
    └── app/            # React Flow UI (port 5173)

Sandbox/
├── scripts/            # Experimental scripts
├── results/            # Outputs (gitignored)
└── archive/            # Old experiments
```

## Notebook Support

DSS supports Jupyter notebooks as first-class pipeline modules. Notebooks in `scripts/*.ipynb` are automatically discovered alongside `.py` files.

### How It Works

Only cells with **type-hinted functions** become DAG nodes:

```python
# This cell becomes a DAG node
def processed_data(raw_data: pd.DataFrame) -> pd.DataFrame:
    """
    Clean and transform raw data.

    @asset: cleaned_dataset
    @viz_output: results/processed/
    """
    return raw_data.dropna().reset_index(drop=True)
```

```python
# This cell is SKIPPED (no return type annotation)
def helper_function(x):
    return x * 2
```

### Requirements for Notebook Cells

1. **Return type annotation** - Function must have `-> ReturnType`
2. **Not private** - Function name cannot start with `_`
3. **Self-contained** - Function cannot rely on notebook global state

### What Won't Work

- Cells without type hints (skipped)
- Magic commands (`%matplotlib inline`)
- Shell commands (`!pip install`)
- Global variables between cells
- Inline visualizations (use `@viz_output` to save to disk)

## Core Concepts

### Function = Node Pattern

Every function becomes a node in the DAG. Dependencies are declared via function arguments:

```python
def data_source() -> DataSource:
    """Create data source from environment."""
    return create_csv_source("./data")

def raw_data(data_source: DataSource) -> pd.DataFrame:
    """Import data from source.

    The 'data_source' argument creates a dependency edge in the DAG.
    DSS automatically resolves execution order.
    """
    return data_source.get_table("users")

def processed_data(
    raw_data: pd.DataFrame,
    config: dict
) -> pd.DataFrame:
    """Process raw data.

    Multiple dependencies - DSS figures out execution order.
    """
    return raw_data.dropna()
```

### Key Patterns

| Concept | How It Works |
|---------|--------------|
| **Node** | Each function becomes a node in the DAG |
| **Edge** | Function arguments create dependency edges |
| **Type** | Return type annotation shown in UI |
| **Doc** | Docstring displayed in detail panel |
| **Module** | File name groups related nodes with shared color |

## Tag Reference

Add tags to docstrings for progressive enhancement:

```python
def my_output(input: pd.DataFrame) -> pd.DataFrame:
    """
    Description here.

    @asset                    # Data catalog entry
    @asset: custom_name       # Named entry
    @location: data/out/      # Output location hint
    @viz_output: results/fig/ # Visualization folder
    @ignore                   # Hide from UI (still runs as dependency)
    @tag: critical            # Custom tag (gray)
    @tag: wip #ff6b6b         # Custom tag with color
    """
```

## Visualization Output Integration

### Adding @viz_output Tags

To enable visualization discovery in the UI, add `@viz_output` tags to docstrings:

```python
def analysis_figures(data: pd.DataFrame) -> Path:
    """Generate analysis visualizations.

    @viz_output: results/analysis_figures
    """
    output_dir = Path("results/analysis_figures")
    output_dir.mkdir(parents=True, exist_ok=True)

    # Save figures
    plt.savefig(output_dir / "figure.png")
    return output_dir
```

### Auto-Discovery Priority

The UI discovers visualizations in this order:
1. `@viz_output` tag in docstring
2. `results/<node_name>/` (convention)
3. Fuzzy match on results subdirectories

### Output Convention

Always save outputs to named subdirectories:
```python
output_dir = Path("results/my_analysis")
output_dir.mkdir(parents=True, exist_ok=True)
(output_dir / "svg").mkdir(exist_ok=True)

plt.savefig(output_dir / "figure.png", dpi=300)
plt.savefig(output_dir / "svg" / "figure.svg")
```

## Promotion Workflow

### Step 1: Validate Sandbox Code

Before promotion, ensure:
- Code runs without errors
- Outputs are correct and useful
- AGC visualization style is applied
- Both PNG and SVG outputs are saved

### Step 2: Identify Target Module

Choose the appropriate module:
- Existing module in `scripts/` - For related functionality
- New module - For distinct domains (create `scripts/[domain].py`)

### Step 3: Write DSS Function

Convert Sandbox script to DSS function:

**Before (Sandbox script):**
```python
# Sandbox/scripts/analyze_data.py
from scripts.utils.visualization import setup_agc_style
from scripts.utils.data_source import create_csv_source

source = create_csv_source("./data")
df = source.get_table("users")
# ... analysis ...
plt.savefig("Sandbox/results/analysis/figure.png")
```

**After (DSS function):**
```python
# In scripts/my_pipeline.py
def user_analysis(data_source: DataSource) -> Path:
    """Analyze user data.

    Processes raw user data and generates visualizations.

    @viz_output: results/user_analysis
    """
    from scripts.utils.visualization import setup_agc_style
    setup_agc_style()

    df = data_source.get_table("users")
    # ... analysis ...

    output_dir = Path("results/user_analysis")
    output_dir.mkdir(parents=True, exist_ok=True)
    plt.savefig(output_dir / "figure.png", dpi=300)
    return output_dir
```

### Step 4: Test in UI

1. Restart the Bun server: `bun run server`
2. Open React UI: `http://localhost:5173`
3. Find your new node in the DAG
4. Click to run and verify outputs

## Auto-Detected Tags

The server auto-detects tags from docstrings:

| Keyword in Docstring | Tag | Color |
|---------------------|-----|-------|
| `postgresql`, `database`, `import` | DB | Blue |
| `download`, `fetch`, `http` | External | Purple |
| `parquet`, `save` | Parquet | Green |
| `figure`, `plot`, `visual` | Viz | Pink |

## Running the Pipeline

### From the UI

1. Start servers:
   ```bash
   # Terminal 1: API server
   bun run server

   # Terminal 2: React UI
   cd scripts/ui/app && bun run dev
   ```

2. Open `http://localhost:5173`
3. Click any node to select it
4. Click "Run This Node" in detail panel
5. Watch live execution output

### From CLI

```bash
# List available outputs
uv run python scripts/run.py --list

# Run specific node
uv run python scripts/run.py --outputs my_node_name
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/graph` | GET | Returns full DAG structure |
| `/api/visualizations/{nodeId}` | GET | Returns images for node |
| `/api/run` | POST | Starts pipeline execution |
| `/api/job/{jobId}` | GET | Returns job status/output |
| `/api/jobs` | GET | Lists all jobs |
| `/static/*` | GET | Serves files from results/ |

## Common Promotion Patterns

### Data Source to DSS Node

```python
def my_data(data_source: DataSource) -> pd.DataFrame:
    """Import my data.

    @asset: my_dataset
    @location: data/processed/
    """
    return data_source.get_table("my_table")
```

### Analysis with Visualization

```python
def my_analysis(
    input_data: pd.DataFrame,
    config: dict
) -> Path:
    """Perform analysis and generate visualizations.

    @viz_output: results/my_analysis
    """
    from scripts.utils.visualization import setup_agc_style, AGC_COLORS
    setup_agc_style()

    # Analysis logic
    result = process(input_data)

    # Create visualization
    fig, ax = plt.subplots(figsize=(10, 6))
    ax.bar(result.index, result.values, color=AGC_COLORS['primary_blue'])

    # Save outputs
    output_dir = Path("results/my_analysis")
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "svg").mkdir(exist_ok=True)

    plt.savefig(output_dir / "analysis.png", dpi=300)
    plt.savefig(output_dir / "svg" / "analysis.svg")
    result.to_parquet(output_dir / "data.parquet")

    return output_dir
```

### Multi-Output Node

```python
def comprehensive_report(
    data_a: pd.DataFrame,
    data_b: pd.DataFrame,
    data_c: pd.DataFrame
) -> Path:
    """Generate comprehensive multi-figure report.

    Creates multiple visualizations from different data sources.

    @viz_output: results/comprehensive_report
    """
    output_dir = Path("results/comprehensive_report")
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "svg").mkdir(exist_ok=True)

    # Figure 1
    fig1, ax1 = plt.subplots()
    # ... plot data_a ...
    plt.savefig(output_dir / "figure_a.png", dpi=300)
    plt.savefig(output_dir / "svg" / "figure_a.svg")
    plt.close()

    # Figure 2
    fig2, ax2 = plt.subplots()
    # ... plot data_b ...
    plt.savefig(output_dir / "figure_b.png", dpi=300)
    plt.savefig(output_dir / "svg" / "figure_b.svg")
    plt.close()

    return output_dir
```

## Checklist for Promotion

- [ ] Function has clear docstring with description
- [ ] Return type annotation is specified
- [ ] Dependencies are declared as function arguments
- [ ] `@viz_output` tag added if function produces visualizations
- [ ] Output directory follows convention: `results/<function_name>/`
- [ ] Both PNG and SVG formats saved for figures
- [ ] AGC visualization style applied
- [ ] Tested in UI - node appears and executes correctly

## Troubleshooting

### Node not appearing in UI
1. Check module is being discovered
2. Restart Bun server
3. Verify Python imports work: `uv run python -c "import scripts.my_module"`

### Visualizations not showing
1. Verify output folder exists: `ls results/<node_name>/`
2. Check `@viz_output` tag matches folder path
3. Ensure images are PNG/JPG/SVG format

### Execution failing
1. Check job output in UI modal
2. Verify all dependencies are available
3. Test function directly in Python

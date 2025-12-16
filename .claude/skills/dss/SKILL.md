---
name: dss
description: Add new nodes to the DSS (Data Science System) pipeline. Use when user wants to create analysis functions, add pipeline nodes, or integrate visualizations.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# DSS Pipeline Skill

This skill guides the creation of new DSS (Data Science System) pipeline nodes. DSS uses Hamilton under the hood as its DAG execution engine.

## When to Use This Skill

Use this skill when:
- User wants to create a new analysis node
- Adding nodes to the pipeline DAG
- Integrating visualization outputs with the DSS UI
- Creating data transformations

## DSS Architecture Overview

```
scripts/
├── run.py              # CLI driver
├── diabetes.py         # Diabetes dataset pipeline
├── rna.py              # RNA-seq dataset pipeline
├── utils/              # Shared utilities
│   ├── data_source.py  # DataSource protocol
│   ├── visualization.py # AGC styling
│   └── notebook_loader.py # Notebook function extraction
└── dss/                # Interactive UI
    ├── start.ts        # Bun server (builds + serves, port 5050)
    └── app/            # React UI source

data/raw/               # Source datasets
results/cache/          # Cached parquet outputs
```

## Core Concepts

### Function = Node Pattern

Every function becomes a node in the DAG. Dependencies are declared via function arguments:

```python
@_cached
def raw_diabetic_data() -> pd.DataFrame:
    """Load the dataset."""
    return pd.read_csv("data/raw/diabetic_data.csv")

@_cached
def readmission_by_age(raw_diabetic_data: pd.DataFrame) -> pd.DataFrame:
    """Analyze readmission rates by age.

    The 'raw_diabetic_data' argument creates a dependency edge in the DAG.
    DSS automatically resolves execution order.

    @asset
    """
    return raw_diabetic_data.groupby('age')['readmitted'].value_counts()
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
@_cached
def my_output(input: pd.DataFrame) -> pd.DataFrame:
    """
    Description here.

    @asset                    # Data catalog entry
    @ignore                   # Hide from UI (still runs as dependency)
    @tag: critical            # Custom tag (gray)
    @tag: wip #ff6b6b         # Custom tag with color
    """
```

## The @_cached Decorator

All pipeline functions should use the `@_cached` decorator:

```python
from functools import wraps
from pathlib import Path

_CACHE_DIR = Path(__file__).parent.parent / "results" / "cache"

def _cached(func):
    """Cache DataFrame outputs as parquet files."""
    @wraps(func)
    def wrapper(*args, **kwargs):
        _CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cache_path = _CACHE_DIR / f"{func.__name__}.parquet"
        result = func(*args, **kwargs)
        if isinstance(result, pd.DataFrame):
            result.to_parquet(cache_path, index=False)
        return result
    wrapper.__name__ = func.__name__
    wrapper.__doc__ = func.__doc__
    wrapper.__annotations__ = func.__annotations__
    return wrapper
```

This enables:
- Data preview in the UI
- Cached data indicator on nodes
- Faster re-runs

## Creating a New Node

### Step 1: Choose the Module

- `scripts/diabetes.py` - For diabetes dataset analysis
- `scripts/rna.py` - For RNA-seq dataset analysis
- New file `scripts/[name].py` - For new data domains

### Step 2: Write the Function

```python
@_cached
def my_analysis(raw_diabetic_data: pd.DataFrame) -> pd.DataFrame:
    """Brief description of what this does.

    More details about the analysis.

    @asset
    """
    # Your analysis code
    result = raw_diabetic_data.groupby('column').agg(...)
    return result
```

### Step 3: Test

```bash
# Via CLI
python scripts/run.py --outputs my_analysis

# Via UI
bun start
# Click the node and run it
```

## Running the Pipeline

### From the UI

1. Start server:
   ```bash
   bun start
   ```

2. Open `http://localhost:5050`
3. Click any node to select it
4. Click "Run" button in detail panel
5. Watch live execution output

### From CLI

```bash
# List available outputs
python scripts/run.py --list

# Run specific node
python scripts/run.py --outputs my_node_name

# Run with direct mode (no server)
python scripts/run.py --outputs my_node_name --direct
```

## Example Node Patterns

### Simple Aggregation

```python
@_cached
def readmission_summary(raw_diabetic_data: pd.DataFrame) -> pd.DataFrame:
    """Summary of readmission outcomes.

    @asset
    """
    return raw_diabetic_data['readmitted'].value_counts().reset_index()
```

### Multi-Input Node

```python
@_cached
def combined_analysis(
    raw_diabetic_data: pd.DataFrame,
    sample_metadata: pd.DataFrame
) -> pd.DataFrame:
    """Combine multiple data sources.

    Creates edges from both raw_diabetic_data and sample_metadata.

    @asset
    """
    # Analysis using both inputs
    return result
```

### Visualization Node

```python
@_cached
def my_visualization(analysis_data: pd.DataFrame) -> pd.DataFrame:
    """Generate visualization and return the data.

    @asset
    """
    import matplotlib.pyplot as plt
    from scripts.utils.visualization import setup_agc_style, AGC_COLORS

    setup_agc_style()

    fig, ax = plt.subplots(figsize=(10, 6))
    ax.bar(analysis_data.index, analysis_data.values, color=AGC_COLORS['primary_blue'])

    # Save to results/
    fig.savefig('results/my_visualization.png', dpi=150)
    plt.close(fig)

    return analysis_data
```

## Auto-Detected Tags

The server auto-detects tags from docstrings:

| Keyword in Docstring | Tag | Color |
|---------------------|-----|-------|
| `postgresql`, `database`, `import` | DB | Blue |
| `download`, `fetch`, `http` | External | Purple |
| `parquet`, `save` | Parquet | Green |
| `figure`, `plot`, `visual` | Viz | Pink |

## Checklist for New Nodes

- [ ] Function has `@_cached` decorator
- [ ] Return type annotation is specified (`-> pd.DataFrame`)
- [ ] Dependencies are declared as function arguments
- [ ] Docstring includes description and `@asset` tag
- [ ] Tested via CLI or UI

## Troubleshooting

### Node not appearing in UI
1. Check module is being discovered: `python scripts/run.py --list`
2. Restart server: kill existing `bun start` and restart
3. Verify Python imports work: `python -c "from scripts.my_module import my_function"`

### Execution failing
1. Check job output in UI modal
2. Verify all dependencies are available
3. Test function directly: `python scripts/run.py --outputs my_node --direct`

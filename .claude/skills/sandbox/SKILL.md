---
name: sandbox
description: Experimental data exploration and visualization in Sandbox/. Use when prototyping, testing methods, exploring new visualization approaches, or doing any experimental work. This is for rapid iteration and exploration only.
allowed-tools: Read, Write, Bash, Grep, Glob
---

# Sandbox Workflow Skill

This skill guides experimental work in the Sandbox/ directory.

## When to Use This Skill

Use this skill when:
- Prototyping new analysis approaches
- Testing methods before production
- Exploring new visualization techniques
- Experimenting with data transformations
- Quick exploratory data analysis
- Testing data source queries
- Any work that is NOT yet ready for production Hamilton pipeline

## Sandbox Directory Structure

```
Sandbox/
├── scripts/           # Active experimental scripts (FLAT - no subdirs)
│   ├── my_analysis.py
│   └── another_test.py
├── results/           # Active outputs (by script name)
│   ├── my_analysis/
│   └── another_test/
├── archive/           # Named batches of old work
│   ├── fall-2024/     # Example archived batch
│   │   ├── scripts/
│   │   └── results/
│   └── {batch-name}/  # Future cleanup batches
└── archive_cleanup.py # Script to archive current work
```

## Key Principle: Flat Active Directories

**scripts/ and results/ should be FLAT** - no subdirectories for active work.
- Put all active scripts directly in `scripts/`
- Each script outputs to `results/{script_name}/`
- When things get cluttered, archive everything to a named batch

## Archive Workflow

When Sandbox gets cluttered, archive all current work:

```bash
# Preview what will be archived
python Sandbox/archive_cleanup.py my-batch-name --dry-run

# Actually archive
python Sandbox/archive_cleanup.py my-batch-name
```

**Batch naming examples:**
- `fall-2024` - seasonal cleanup
- `pre-ml-refactor` - before major changes
- `december-experiments` - monthly cleanup
- `exploration-v1` - topic-based

The archive preserves the script-results pairing so you can reference old work if needed.

## Key Principles

### 1. Always Use AGC Visualization Style
Even in experimental work, maintain visualization standards:

```python
import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from scripts.utils.visualization import setup_agc_style, AGC_COLORS

setup_agc_style()

fig, ax = plt.subplots(figsize=(10, 6))
ax.bar(x, y, color=AGC_COLORS['primary_blue'],
       edgecolor=AGC_COLORS['black'], linewidth=1.5)

# Save both PNG and SVG
output_dir = Path('Sandbox/results/my_script')
output_dir.mkdir(parents=True, exist_ok=True)
(output_dir / 'svg').mkdir(exist_ok=True)
plt.savefig(output_dir / 'my_analysis.png', dpi=300)
plt.savefig(output_dir / 'svg' / 'my_analysis.svg')
```

### 2. Use Shared Utilities

Import from `scripts/utils/` for data sources and visualization:

```python
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from scripts.utils.data_source import create_csv_source
from scripts.utils.visualization import setup_agc_style, AGC_COLORS

# Connect to data source
source = create_csv_source("./data")

# Get data
df = source.get_table("users")

# Setup visualization
setup_agc_style()
```

### 3. Create Singularly Focused Figures

Each script should generate **focused, single-purpose** visualizations:
- One metric per figure
- Clear, specific title
- Single message or insight
- Avoid multiple unrelated plots in one figure

## Workflow Steps

### 1. Create Script in scripts/

```bash
# Create your script directly in scripts/
touch Sandbox/scripts/my_analysis.py
```

### 2. Write Experimental Script

```python
"""
Experimental: Testing new analysis method

This is a Sandbox experiment. If validated, promote to Hamilton pipeline
using the /hamilton skill.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from scripts.utils.data_source import create_csv_source
from scripts.utils.visualization import setup_agc_style, AGC_COLORS

def my_experiment():
    setup_agc_style()

    # Your experimental code here

    # Save results
    output_dir = Path('Sandbox/results/my_analysis')
    output_dir.mkdir(parents=True, exist_ok=True)
    # ... save figures and data

if __name__ == "__main__":
    my_experiment()
```

### 3. Run and Iterate

```bash
uv run python Sandbox/scripts/my_analysis.py
```

Iterate quickly! No need for:
- Hamilton pipeline integration
- Full production logging
- Comprehensive error handling (add when promoting)

### 4. Save Results to results/{script_name}/

```python
output_dir = Path("Sandbox/results/my_analysis")
output_dir.mkdir(parents=True, exist_ok=True)
(output_dir / "svg").mkdir(exist_ok=True)

# Save both PNG and SVG for all figures
plt.savefig(output_dir / "my_figure.png", dpi=300)
plt.savefig(output_dir / "svg" / "my_figure.svg")
df.to_parquet(output_dir / "my_data.parquet")
```

### 5. When Ready for Production

Use the `/hamilton` skill to promote work:
- Convert script to Hamilton function in `scripts/` (e.g., `scripts/analysis.py`)
- Add `@viz_output` tag in docstring for visualization discovery
- Add full logging and error handling
- Test in Hamilton UI at http://localhost:5173

### 6. When Sandbox Gets Cluttered

Archive everything and start fresh:

```bash
python Sandbox/archive_cleanup.py my-batch-name
```

## Common Patterns

### Quick Data Source Test

```python
from scripts.utils.data_source import create_csv_source

source = create_csv_source("./data")

# List available tables
tables = source.list_tables()
print("Available tables:", tables)

# Get data
df = source.get_table("users")
print(df.head())
```

### Analysis Prototype

```python
from scripts.utils.data_source import create_csv_source
from scripts.utils.visualization import setup_agc_style, AGC_COLORS
import matplotlib.pyplot as plt
from pathlib import Path

source = create_csv_source("./data")
setup_agc_style()

# Load data
df = source.get_table("users")

# Quick visualization
plt.figure(figsize=(10, 6))
plt.hist(df['age'], bins=50, color=AGC_COLORS['primary_blue'])

# Save both formats
output_dir = Path('Sandbox/results/quick_analysis')
output_dir.mkdir(parents=True, exist_ok=True)
(output_dir / 'svg').mkdir(exist_ok=True)
plt.savefig(output_dir / 'histogram.png', dpi=300)
plt.savefig(output_dir / 'svg' / 'histogram.svg')
```

### Exploratory Data Analysis

```python
from scripts.utils.data_source import create_csv_source
import pandas as pd

source = create_csv_source("./data")

# Explore available data
tables = source.list_tables()
print("Available tables:", tables)

# Sample data
df = source.get_table("users")
print(df.describe())
print(df.head())
```

## Important Reminders

1. **Never commit large data files** - Add `*.parquet` and `*.csv` to `.gitignore` for Sandbox/
2. **Always save both PNG and SVG** - Every matplotlib figure must be saved in both formats
3. **Keep scripts/ flat** - No subdirectories in active work
4. **Archive when cluttered** - Use `archive_cleanup.py` to sweep old work
5. **Promote validated work** - Use `/hamilton` skill when ready for production

## Accessing Archived Work

Archived scripts are in `Sandbox/archive/{batch-name}/scripts/`. To reuse:
1. Copy the script back to `Sandbox/scripts/`
2. Fix any path issues (archived scripts may have stale relative paths)
3. Run as normal

## Tools Available in This Skill

When this skill is active, you have automatic permission to use:
- **Read** - Read files for analysis
- **Write** - Create experimental scripts
- **Bash** - Run scripts and queries
- **Grep** - Search for patterns
- **Glob** - Find files

You will need permission for:
- **Edit** - Modifying existing files
- **Hamilton operations** - Use /hamilton skill instead

## Quick Reference

```bash
# Run experiment
uv run python Sandbox/scripts/my_script.py

# View results
ls Sandbox/results/

# Archive current work
python Sandbox/archive_cleanup.py batch-name --dry-run  # preview
python Sandbox/archive_cleanup.py batch-name            # actually archive

# List archived batches
ls Sandbox/archive/
```

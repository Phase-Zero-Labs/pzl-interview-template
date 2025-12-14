# Sandbox - Experimental Environment

This directory is for rapid experimentation and exploratory analysis.
Scripts here can be promoted to the production Hamilton pipeline after validation.

## Directory Structure

```
Sandbox/
├── scripts/          # Experimental scripts (FLAT - no subdirectories)
├── utils/            # Copy of scripts/utils for experimentation
├── results/          # Script outputs (gitignored)
├── archive/          # Named batches of old work
├── archive_cleanup.py # Archive current work
└── README.md
```

## Git Tracking

**Committed to git:**
- `scripts/` - All Python scripts
- `utils/` - Utility copies
- `archive/` - Archived batches
- `README.md`

**Gitignored:**
- `results/` - All outputs (figures, CSVs, parquets)
- `data/` - Temporary data files
- `*.parquet`, `*.csv` at root level

## Workflow

### 1. Create Experimental Script

Create a new script in `Sandbox/scripts/` (flat, no subdirectories):

```python
# Sandbox/scripts/my_analysis.py
from Sandbox.utils.visualization import setup_agc_style, AGC_COLORS
from Sandbox.utils.data_source import CSVDataSource
from pathlib import Path

# Setup
setup_agc_style()
source = CSVDataSource(Path("./data/raw"))

# Load data
df = source.get_table("users")

# Analysis...
# ...

# Save outputs
output_dir = Path("Sandbox/results/my_analysis")
output_dir.mkdir(parents=True, exist_ok=True)
plt.savefig(output_dir / "figure.png", dpi=300)
```

### 2. Run from Project Root

Always run Sandbox scripts from the project root for imports to work:

```bash
cd /path/to/ds-template
python Sandbox/scripts/my_analysis.py
```

### 3. Promote to Production

When your analysis is validated, convert to a Hamilton function:

**Before (Sandbox):**
```python
# Sandbox/scripts/my_analysis.py
from Sandbox.utils.data_source import CSVDataSource
source = CSVDataSource(Path("./data/raw"))
df = source.get_table("users")
```

**After (Hamilton):**
```python
# scripts/analysis.py
def my_analysis(users_raw: pd.DataFrame) -> pd.DataFrame:
    """Analysis description.

    @viz_output: results/my_analysis
    """
    # ... analysis logic ...
    return result
```

Key changes:
- `Sandbox.utils.*` -> `scripts.utils.*`
- Direct data loading -> Hamilton dependency injection
- Return value for DAG connection

### 4. Archive When Cluttered

When Sandbox gets messy, archive everything to a named batch:

```bash
# Preview what will be archived
python Sandbox/archive_cleanup.py my-batch-name --dry-run

# Actually archive
python Sandbox/archive_cleanup.py my-batch-name
```

This moves:
- `Sandbox/scripts/*` -> `Sandbox/archive/my-batch-name/scripts/`
- `Sandbox/results/*` -> `Sandbox/archive/my-batch-name/results/`

## Import Pattern

In Sandbox scripts, import from `Sandbox.utils`:

```python
from Sandbox.utils.visualization import setup_agc_style, AGC_COLORS, format_title
from Sandbox.utils.data_source import CSVDataSource, DataSource
import pandas as pd
import numpy as np
```

This mirrors the production import pattern (`scripts.utils`) but keeps
experimental work isolated.

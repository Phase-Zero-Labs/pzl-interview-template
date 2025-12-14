# PZL Interview Template

## Overview

This is a data science interview exercise using:
- **Dataset**: Diabetes 130-US Hospitals (1999-2008) - 101K patient encounters
- **Framework**: Hamilton DAG-based pipelines
- **Tool**: Claude Code (or similar AI assistant)

## For Candidates

Start here:
1. Read `interview/INSTRUCTIONS.md`
2. Run setup: `uv sync && source .venv/bin/activate`
3. Verify: `python -c "from scripts.diabetes import raw_diabetic_data; print(raw_diabetic_data().shape)"`

## Project Structure

```
scripts/diabetes/       # Your starting point (just data loading)
scripts/utils/          # Hamilton helpers, visualization
interview/              # Instructions and questions
docs/background/        # Optional reading (git, Hamilton, data assets)
Sandbox/                # Scratch space for experiments
data/raw/               # Dataset files
results/                # Outputs (gitignored)
```

## Hamilton Pattern

Functions become DAG nodes. Parameter names matching function names create edges:

```python
def raw_diabetic_data() -> pd.DataFrame:
    """Load the dataset."""
    return pd.read_csv("data/raw/diabetic_data.csv")

def cleaned_data(raw_diabetic_data: pd.DataFrame) -> pd.DataFrame:
    """Parameter 'raw_diabetic_data' matches function above.
    Edge created: raw_diabetic_data -> cleaned_data"""
    return raw_diabetic_data.replace("?", pd.NA)
```

## CLI

```bash
python scripts/run.py --list                    # See available nodes
python scripts/run.py --outputs raw_diabetic_data   # Run specific node
python scripts/run.py --visualize               # Show DAG
```

## Visualization

Use AGC styling for figures:

```python
from scripts.utils.visualization import setup_agc_style, AGC_COLORS

setup_agc_style()
ax.bar(x, y, color=AGC_COLORS['primary_blue'])
```

## Dataset Notes

- 101,766 rows, 50 columns
- Missing values marked as `?` in some columns
- Target: `readmitted` (<30 / >30 / No)
- 23 medication columns with dosage change indicators
- ICD-9 diagnosis codes in `diag_1`, `diag_2`, `diag_3`

## Development Workflow

1. Experiment in `Sandbox/scripts/`
2. Save outputs to `Sandbox/results/`
3. Promote validated code to `scripts/diabetes/`

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
scripts/diabetes.py     # Main pipeline module (data loading + analysis)
scripts/utils/          # Hamilton helpers, visualization
scripts/ui/             # Web UI for DAG visualization
interview/              # Instructions and questions
docs/background/        # Optional reading (git, Hamilton, data assets)
Sandbox/                # Scratch space for experiments
data/raw/               # Dataset files
results/cache/          # Cached pipeline outputs (parquet files)
```

## Hamilton Pattern

Functions become DAG nodes. Parameter names matching function names create edges:

```python
@cached
def raw_diabetic_data() -> pd.DataFrame:
    """Load the dataset."""
    return pd.read_csv("data/raw/diabetic_data.csv")

@cached
def cleaned_data(raw_diabetic_data: pd.DataFrame) -> pd.DataFrame:
    """Parameter 'raw_diabetic_data' matches function above.
    Edge created: raw_diabetic_data -> cleaned_data"""
    return raw_diabetic_data.replace("?", pd.NA)
```

## Caching

All pipeline functions use the `@cached` decorator which:
- Saves DataFrame outputs as parquet files to `results/cache/`
- Enables the UI to show cached data previews
- Files are named `{function_name}.parquet`

To clear the cache:
```bash
rm -rf results/cache/*.parquet
```

## Running the UI

```bash
# Terminal 1: Start the API server
bun run server

# Terminal 2: Start the frontend
cd scripts/ui/app && bun run dev

# Open http://localhost:5173 (or 5174 if 5173 is busy)
```

The UI shows:
- DAG visualization of all pipeline nodes
- Click nodes to run them and see data previews
- Cached data indicator (shows when parquet files exist)
- Job history and execution logs

## CLI

```bash
python scripts/run.py --list                        # See available nodes
python scripts/run.py --outputs raw_diabetic_data   # Run specific node
python scripts/run.py --outputs cleaned_data        # Runs dependencies too
python scripts/run.py --visualize                   # Show DAG
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
- Missing values marked as `?` in some columns (cleaned to NaN in `cleaned_data`)
- Target: `readmitted` (<30 / >30 / No)
- Binary targets created: `readmit_30`, `readmit_any`
- 23 medication columns with dosage change indicators (Up/Down/Steady/No)
- Medication flags created: `{med}_changed`, `{med}_prescribed`
- ICD-9 diagnosis codes in `diag_1`, `diag_2`, `diag_3`

## Available Pipeline Nodes

| Node | Description |
|------|-------------|
| `raw_diabetic_data` | Load raw CSV (101K rows, 50 cols) |
| `cleaned_data` | Clean data + create features (96 cols) |
| `demographic_summary` | Readmission rates by race/gender/age |
| `medication_analysis` | Each medication's impact on readmission |
| `admission_los_analysis` | Admission source x length of stay interaction |
| `a1c_disparity_analysis` | A1C testing disparities by race/severity |

## Development Workflow

1. Experiment in `Sandbox/scripts/`
2. Save outputs to `Sandbox/results/`
3. Promote validated code to `scripts/diabetes.py`
4. Add `@cached` decorator for UI integration

# PZL Interview Template

## Overview

This is a data science interview exercise using:
- **Datasets**:
  - Diabetes 130-US Hospitals (1999-2008) - 101K patient encounters
  - RNA-seq drug screening - 52 samples, 78K genes
- **Framework**: Hamilton DAG-based pipelines
- **Tool**: Claude Code (or similar AI assistant)

## For Candidates

Start here:
1. Read `interview/INSTRUCTIONS.md`
2. Run setup: `uv sync && source .venv/bin/activate`
3. Verify: `python -c "from scripts.diabetes import raw_diabetic_data; print(raw_diabetic_data().shape)"`
4. Launch UI: `bun start`

## Project Structure

```
scripts/diabetes.py     # Diabetes dataset pipeline
scripts/rna.py          # RNA-seq dataset pipeline
scripts/utils/          # Hamilton helpers, visualization
scripts/dss/            # PZL-DSS UI for DAG visualization
interview/              # Instructions and questions
data/raw/               # Dataset files
results/cache/          # Cached pipeline outputs (parquet files)
```

## Hamilton Pattern

Functions become DAG nodes. Parameter names matching function names create edges:

```python
@_cached
def raw_diabetic_data() -> pd.DataFrame:
    """Load the dataset."""
    return pd.read_csv("data/raw/diabetic_data.csv")

@_cached
def readmission_by_age(raw_diabetic_data: pd.DataFrame) -> pd.DataFrame:
    """Parameter 'raw_diabetic_data' matches function above.
    Edge created: raw_diabetic_data -> readmission_by_age"""
    return raw_diabetic_data.groupby('age')['readmitted'].value_counts()
```

## Caching

Pipeline functions use the `@_cached` decorator which:
- Saves DataFrame outputs as parquet files to `results/cache/`
- Enables the UI to show cached data previews
- Files are named `{function_name}.parquet`

To clear the cache:
```bash
rm -rf results/cache/*.parquet
```

## Running the UI

```bash
# Single command (auto-opens browser):
bun start

# Without auto-open:
bun start --no-open
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
python scripts/run.py --outputs readmission_by_age  # Runs dependencies too
python scripts/run.py --visualize                   # Show DAG
```

## Available Data Sources

### Diabetes Dataset (scripts/diabetes.py)
| Node | Description |
|------|-------------|
| `raw_diabetic_data` | Load raw CSV (101K rows, 50 cols) |
| `readmission_by_age` | Example: readmission rates by age group |

### RNA-seq Dataset (scripts/rna.py)
| Node | Description |
|------|-------------|
| `sample_metadata` | Drug screening sample info (60 samples) |
| `raw_gene_counts` | Salmon gene counts (78K genes x 52 samples) |

## Dataset Notes

### Diabetes
- 101,766 rows, 50 columns
- Missing values marked as `?`
- Target: `readmitted` (<30 / >30 / No)
- 23 medication columns with dosage change indicators

### RNA-seq
- 52 samples across 3 plates
- 14 compounds tested (ADCs + free drugs + controls)
- 78,932 genes (Salmon quantification)

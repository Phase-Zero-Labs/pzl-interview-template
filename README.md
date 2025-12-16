# Data Science Interview Exercise

## Overview

You'll work with real clinical and biological datasets using Hamilton DAG pipelines and AI assistance.

**Datasets**:
- Diabetes 130-US Hospitals (1999-2008) - 101K patient encounters
- RNA-seq drug screening - mABs and other compounds exposed to skin organoids

**Time**: ~1 hour
**Tools**: This repo + Claude Code (or your preferred AI assistant)

## Quick Start

```bash
# Clone and enter
git clone https://github.com/Phase-Zero-Labs/pzl-interview-template.git
cd pzl-interview-template

# Install dependencies
uv sync

# Activate environment
source .venv/bin/activate

# Verify setup
python -c "from scripts.diabetes import raw_diabetic_data; print(raw_diabetic_data().shape)"
# Should print: (101766, 50)

# Launch UI (optional)
bun start
```

## What We're Evaluating

This is **not** a test of what you know. We're interested in:

1. **How you collaborate with AI** - Your prompting strategy, iteration process, and knowing when to trust (or question) AI output
2. **Your analytical thinking** - How you explore data, form hypotheses, and validate findings
3. **Communication** - Talking through your reasoning as you work

There are no trick questions. The datasets are messy. Perfect answers don't exist.

## The Datasets

### Diabetes (scripts/diabetes.py)

Clinical data from 130 US hospitals. Each row is a diabetic patient encounter.

| Attribute | Value |
|-----------|-------|
| Rows | 101,766 patient encounters |
| Columns | 50 features |
| Target | `readmitted` (<30 days / >30 days / No) |

Key features:
- **Demographics**: race, gender, age (binned by decade)
- **Encounter**: admission_type, discharge_disposition, time_in_hospital
- **Clinical**: num_lab_procedures, num_medications, number_diagnoses
- **Medications**: 23 drug columns showing dosage changes (Up/Down/Steady/No)

### RNA-seq (scripts/rna.py)

Gene expression from drug screening experiments - mABs and other compounds exposed at multiple concentrations to skin organoids.

| Attribute | Value |
|-----------|-------|
| Samples | 52 across 3 plates |
| Genes | 78,932 |
| Compounds | 14 (ADCs, free drugs, controls) |

## Data Quality Notes

This is real-world data with real-world messiness:
- Missing values encoded as `?` (not NaN)
- High missingness in `weight`, `medical_specialty`, `payer_code`
- Class imbalance in readmission target (~54% No, ~35% >30, ~11% <30)
- Diagnosis codes are raw ICD-9

## Getting Started

```python
from scripts.diabetes import raw_diabetic_data

df = raw_diabetic_data()
```

The repo uses Hamilton for DAG-based pipelines. Functions with matching parameter names create edges:

```python
def my_analysis(raw_diabetic_data: pd.DataFrame) -> pd.DataFrame:
    # Parameter name matches function above - Hamilton creates the edge
    return raw_diabetic_data.groupby('age')['readmitted'].value_counts()
```

## CLI Reference

```bash
python scripts/run.py --list                        # See available nodes
python scripts/run.py --outputs raw_diabetic_data   # Run specific node
python scripts/run.py --outputs readmission_by_age  # Runs dependencies too
python scripts/run.py --visualize                   # Show DAG
```

## Available Nodes

### Diabetes
| Node | Description |
|------|-------------|
| `raw_diabetic_data` | Load raw CSV (101K rows, 50 cols) |
| `admission_type_lookup` | ID to description mapping (8 types) |
| `discharge_disposition_lookup` | ID to description mapping (30 types) |
| `admission_source_lookup` | ID to description mapping (25 types) |
| `readmission_by_age` | Example analysis: readmission rates by age |

### RNA-seq
| Node | Description |
|------|-------------|
| `sample_metadata` | Sample info (52 samples, plate/compound/concentration) |
| `raw_gene_counts` | Salmon gene counts (78K genes x 52 samples) |

## Project Structure

```
pzl-interview-template/
├── scripts/
│   ├── diabetes.py        # Diabetes dataset pipeline
│   ├── rna.py             # RNA-seq dataset pipeline
│   ├── run.py             # CLI driver
│   └── utils/             # Hamilton helpers
├── data/raw/              # Dataset files
└── results/cache/         # Cached outputs (gitignored)
```

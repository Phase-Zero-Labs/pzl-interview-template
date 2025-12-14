# PZL Interview Template

Data science interview exercise using the Diabetes 130-US Hospitals dataset and Hamilton DAG framework.

## Quick Start

```bash
# Clone
git clone https://github.com/Phase-Zero-Labs/pzl-interview-template.git
cd pzl-interview-template

# Install dependencies
uv sync

# Activate environment
source .venv/bin/activate

# Verify
python -c "from scripts.diabetes import raw_diabetic_data; print(raw_diabetic_data().shape)"
# (101766, 50)
```

## For Candidates

See [`interview/INSTRUCTIONS.md`](interview/INSTRUCTIONS.md) for the full exercise instructions.

**Background reading** (optional):
- [`docs/background/git-best-practices.md`](docs/background/git-best-practices.md)
- [`docs/background/hamilton-intro.md`](docs/background/hamilton-intro.md)
- [`docs/background/data-assets.md`](docs/background/data-assets.md)

## Dataset

**Diabetes 130-US Hospitals (1999-2008)**
- Source: [UCI ML Repository](https://archive.ics.uci.edu/dataset/296)
- License: CC BY 4.0
- 101,766 patient encounters, 50 features
- Target: Hospital readmission (<30 days / >30 days / No)

## Project Structure

```
pzl-interview-template/
├── scripts/
│   ├── diabetes/          # Starter code (data loading)
│   ├── utils/             # Hamilton helpers, visualization
│   └── run.py             # CLI driver
├── data/raw/              # Dataset files
├── interview/             # Instructions and questions
├── docs/background/       # Optional reading
├── Sandbox/               # Scratch space for experiments
└── results/               # Output directory (gitignored)
```

## Using Hamilton

```bash
# List available nodes
python scripts/run.py --list

# Execute specific outputs
python scripts/run.py --outputs raw_diabetic_data

# Visualize DAG
python scripts/run.py --visualize
```

## For Evaluators

Interview guide and rubric are on the `evaluator` branch:

```bash
git checkout evaluator
```

---

Based on [ds-template](https://github.com/Shaun-Regenbaum/ds-template).

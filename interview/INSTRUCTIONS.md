# Data Science Interview Exercise

## Overview

You'll be working with real clinical data from 130 US hospitals (1999-2008). Each row represents a diabetic patient encounter with information about their hospital stay, medications, and whether they were readmitted.

**Time**: ~55 minutes total
**Tools**: This repo + Claude Code (or your preferred AI assistant)

## Setup

```bash
# Clone and enter the repo
git clone https://github.com/Phase-Zero-Labs/pzl-interview-template.git
cd pzl-interview-template

# Install dependencies
uv sync

# Activate environment
source .venv/bin/activate

# Verify setup
python -c "from scripts.diabetes import raw_diabetic_data; print(raw_diabetic_data().shape)"
# Should print: (101766, 50)
```

## What We're Evaluating

This is **not** a test of what you know. We're interested in:

1. **How you collaborate with AI** - Your prompting strategy, iteration process, and knowing when to trust (or question) AI output
2. **Your analytical thinking** - How you explore data, form hypotheses, and validate findings
3. **Communication** - Talking through your reasoning as you work

There are no trick questions. The dataset is messy (like real data). Perfect answers don't exist.

## Structure

| Section | Time | Focus |
|---------|------|-------|
| Setup & Orientation | 10 min | Get environment running, initial exploration |
| Guided Analysis | 20 min | Work through specific questions with interviewer |
| Open Exploration | 15 min | Find something interesting on your own |
| Debrief | 10 min | Reflect on your process |

## The Dataset

**Source**: UCI Machine Learning Repository
**Rows**: 101,766 patient encounters
**Features**: 50 columns

Key variable groups:
- **Demographics**: race, gender, age (binned by decade)
- **Encounter**: admission_type, discharge_disposition, time_in_hospital
- **Clinical**: num_lab_procedures, num_medications, number_diagnoses
- **Medications**: 23 drug columns showing dosage changes (Up/Down/Steady/No)
- **Target**: `readmitted` - Was patient readmitted within 30 days, after 30 days, or not at all?

## Data Quality Notes

This is real-world data with real-world messiness:
- Missing values in `race`, `weight`, `payer_code`, `medical_specialty`
- Some `?` values representing unknown/missing
- Diagnosis codes are raw ICD-9 (you may want to categorize them)
- Class imbalance in the target variable

## Getting Started

The repo uses Hamilton for DAG-based data pipelines. Your starting point:

```python
from scripts.diabetes import raw_diabetic_data

df = raw_diabetic_data()
```

From here, you can:
- Add functions to `scripts/diabetes/__init__.py` to build a pipeline
- Work in `Sandbox/scripts/` for quick experiments
- Use Jupyter notebooks if you prefer

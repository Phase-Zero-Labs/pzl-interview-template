# Hamilton & DAG-Based Pipelines - Curated Links

Hamilton is a Python framework that turns functions into a directed acyclic graph (DAG). Write functions, let Hamilton figure out the execution order.

---

## Core Concept

```python
# Parameter names = edges in the DAG
def raw_data() -> pd.DataFrame:
    return pd.read_csv("data.csv")

def cleaned_data(raw_data: pd.DataFrame) -> pd.DataFrame:
    # Hamilton sees "raw_data" parameter matches "raw_data" function
    # Automatically creates edge: raw_data -> cleaned_data
    return raw_data.dropna()
```

---

## Official Documentation

- **[Hamilton Docs](https://hamilton.dagworks.io/en/latest/)** - Complete reference with tutorials, concepts, and API.

- **[Why Hamilton?](https://blog.dagworks.io/p/functions-dags-introducing-hamilton)** - Blog post explaining the motivation and design philosophy.

- **[Hamilton GitHub](https://github.com/DAGWorks-Inc/hamilton)** - Source code, examples, and issue tracker.

---

## Tutorials & Examples

- **[Hamilton in 15 Minutes](https://hamilton.dagworks.io/en/latest/get-started/learning-hamilton/)** - Quick start guide with runnable examples.

- **[Example Gallery](https://github.com/DAGWorks-Inc/hamilton/tree/main/examples)** - Real-world use cases: ML pipelines, LLM apps, data processing.

- **[Hamilton + Pandas Tutorial](https://hamilton.dagworks.io/en/latest/tutorials/hello_world/)** - Step-by-step guide using pandas DataFrames.

---

## Key Features

- **[Decorators Reference](https://hamilton.dagworks.io/en/latest/reference/decorators/)** - `@extract_columns`, `@check_output`, `@config.when`, etc.

- **[Data Quality](https://hamilton.dagworks.io/en/latest/how-tos/use-hamilton-for-data-quality/)** - Built-in validation with Pandera integration.

- **[Visualization](https://hamilton.dagworks.io/en/latest/how-tos/visualize-your-dag/)** - Generate DAG diagrams from your code.

---

## This Template

This repo uses Hamilton with some custom extensions:

```bash
# List available nodes
python scripts/run.py --list

# Execute specific outputs
python scripts/run.py --outputs cleaned_data summary_stats

# Visualize the DAG
python scripts/run.py --visualize
```

See `scripts/utils/` for data loading utilities and visualization helpers.

# DSS Integration

This project integrates with the central Data Science System (DSS) at `dss.tailb726.ts.net`.

## Requirements

### 1. dss.config.ts
Each project needs a `dss.config.ts` file at the root:

```typescript
const config = {
  projectName: "your-project-name",  // Unique identifier
  modules: [],                        // Auto-discovered from scripts/*.py
  resultsPath: "results",             // Where outputs are stored
  syncEnabled: true,                  // Sync metadata to central
  stateDir: ".pzl-dss",              // Local state directory
};

export default config;
```

### 2. Hamilton Functions
Place Hamilton functions in `scripts/*.py`. The DSS CLI auto-discovers:
- Function names become node IDs
- Function parameters become dependency edges
- Return type annotations generate tags (DataFrame, Series, etc.)
- Docstrings appear as node descriptions

Example:
```python
def raw_data(file_path: str) -> pd.DataFrame:
    """Load raw experimental data."""
    return pd.read_csv(file_path)

def processed_data(raw_data: pd.DataFrame) -> pd.DataFrame:
    """Clean and normalize the data."""
    return raw_data.dropna()
```

### 3. Running with DSS

```bash
# Start local agent (discovers all Hamilton projects)
dss serve

# View at central UI
open https://dss.tailb726.ts.net
```

## Local State

The `.pzl-dss/` directory stores local run history and is gitignored.

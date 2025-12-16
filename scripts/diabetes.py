"""
Diabetes 130-US Hospitals Dataset (1999-2008)

10 years of clinical care data across 130 US hospitals.
Each row represents a diabetic patient encounter.

Source: https://archive.ics.uci.edu/dataset/296
License: CC BY 4.0
"""

import pandas as pd
from pathlib import Path
from functools import wraps


# =============================================================================
# Caching utilities (prefixed with _ to hide from Hamilton)
# =============================================================================

_CACHE_DIR = Path(__file__).parent.parent / "results" / "cache"


def _cached(func):
    """
    Decorator that caches DataFrame outputs as parquet files.

    Cache is stored in results/cache/{function_name}.parquet
    The cache is automatically invalidated when the pipeline is re-run.
    """
    @wraps(func)
    def wrapper(*args, **kwargs):
        _CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cache_path = _CACHE_DIR / f"{func.__name__}.parquet"

        # Always execute the function (Hamilton manages the DAG)
        result = func(*args, **kwargs)

        # Cache if it's a DataFrame
        if isinstance(result, pd.DataFrame):
            result.to_parquet(cache_path, index=False)

        return result

    # Preserve function metadata for Hamilton
    wrapper.__name__ = func.__name__
    wrapper.__doc__ = func.__doc__
    wrapper.__annotations__ = func.__annotations__
    return wrapper


# =============================================================================
# Data Sources
# =============================================================================


@_cached
def raw_diabetic_data() -> pd.DataFrame:
    """
    Load the diabetes 130-US hospitals dataset.

    Returns a DataFrame with 101,766 patient encounters and 50 features including:
    - Patient demographics (race, gender, age)
    - Encounter details (admission_type, discharge_disposition, time_in_hospital)
    - Clinical measurements (num_lab_procedures, num_medications, number_diagnoses)
    - Medication flags (23 drugs with dosage change indicators)
    - Target: readmitted (<30 days / >30 days / No)

    @asset
    """
    data_path = Path(__file__).parent.parent / "data" / "raw" / "diabetic_data.csv"
    return pd.read_csv(data_path)

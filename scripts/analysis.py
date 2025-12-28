"""
Custom analysis pipeline for diabetic data exploration.
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
    """
    @wraps(func)
    def wrapper(*args, **kwargs):
        _CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cache_path = _CACHE_DIR / f"{func.__name__}.parquet"

        result = func(*args, **kwargs)

        if isinstance(result, pd.DataFrame):
            result.to_parquet(cache_path, index=False)

        return result

    wrapper.__name__ = func.__name__
    wrapper.__doc__ = func.__doc__
    wrapper.__annotations__ = func.__annotations__
    return wrapper


# =============================================================================
# Data Sources
# =============================================================================


@_cached
def diabetic_data() -> pd.DataFrame:
    """
    Load the diabetes 130-US hospitals dataset.

    Returns a DataFrame with 101,766 patient encounters and 50 features.

    @asset
    """
    data_path = Path(__file__).parent.parent / "data" / "raw" / "diabetic_data.csv"
    return pd.read_csv(data_path)

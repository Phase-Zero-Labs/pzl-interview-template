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


def _parse_ids_mapping() -> dict[str, pd.DataFrame]:
    """
    Parse the IDS_mapping.csv file which contains three stacked lookup tables.

    Returns a dict with keys: 'admission_type', 'discharge_disposition', 'admission_source'
    """
    data_path = Path(__file__).parent.parent / "data" / "raw" / "IDS_mapping.csv"

    with open(data_path, "r") as f:
        lines = f.readlines()

    tables = {}
    current_table = None
    current_rows = []

    for line in lines:
        line = line.strip()
        if not line or line == ",":
            if current_table and current_rows:
                tables[current_table] = current_rows
                current_rows = []
            continue

        if line.startswith("admission_type_id,"):
            current_table = "admission_type"
            continue
        elif line.startswith("discharge_disposition_id,"):
            current_table = "discharge_disposition"
            continue
        elif line.startswith("admission_source_id,"):
            current_table = "admission_source"
            continue

        if current_table:
            parts = line.split(",", 1)
            if len(parts) == 2 and parts[0].strip():
                current_rows.append({
                    "id": int(parts[0].strip()),
                    "description": parts[1].strip().strip('"')
                })

    if current_table and current_rows:
        tables[current_table] = current_rows

    return {k: pd.DataFrame(v) for k, v in tables.items()}


@_cached
def admission_type_lookup() -> pd.DataFrame:
    """
    Lookup table for admission_type_id codes.

    Maps numeric IDs to descriptions:
    1=Emergency, 2=Urgent, 3=Elective, 4=Newborn, etc.

    Join with raw_diabetic_data on admission_type_id.

    @asset
    """
    return _parse_ids_mapping()["admission_type"]


@_cached
def discharge_disposition_lookup() -> pd.DataFrame:
    """
    Lookup table for discharge_disposition_id codes.

    Maps numeric IDs to descriptions:
    1=Discharged to home, 6=Discharged with home health service,
    7=Left AMA, 11=Expired, 13=Hospice/home, etc.

    Join with raw_diabetic_data on discharge_disposition_id.

    @asset
    """
    return _parse_ids_mapping()["discharge_disposition"]


@_cached
def admission_source_lookup() -> pd.DataFrame:
    """
    Lookup table for admission_source_id codes.

    Maps numeric IDs to descriptions:
    1=Physician Referral, 4=Transfer from hospital,
    7=Emergency Room, etc.

    Join with raw_diabetic_data on admission_source_id.

    @asset
    """
    return _parse_ids_mapping()["admission_source"]


# =============================================================================
# Example Analysis Node
# =============================================================================


@_cached
def readmission_by_age(raw_diabetic_data: pd.DataFrame) -> pd.DataFrame:
    """
    Readmission rates broken down by age group.

    Shows the percentage of patients readmitted within 30 days,
    after 30 days, or not readmitted, for each age bracket.

    @asset
    """
    summary = raw_diabetic_data.groupby('age')['readmitted'].value_counts(normalize=True)
    summary = summary.unstack(fill_value=0) * 100
    summary = summary.round(2).reset_index()
    summary.columns.name = None
    return summary

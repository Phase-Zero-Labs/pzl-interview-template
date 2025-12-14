"""
Diabetes 130-US Hospitals Dataset (1999-2008)

10 years of clinical care data across 130 US hospitals.
Each row represents a diabetic patient encounter.

Source: https://archive.ics.uci.edu/dataset/296
License: CC BY 4.0
"""

import pandas as pd
import numpy as np
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


# Medication columns in the dataset
MEDICATION_COLS = [
    'metformin', 'repaglinide', 'nateglinide', 'chlorpropamide',
    'glimepiride', 'acetohexamide', 'glipizide', 'glyburide',
    'tolbutamide', 'pioglitazone', 'rosiglitazone', 'acarbose',
    'miglitol', 'troglitazone', 'tolazamide', 'examide',
    'citoglipton', 'insulin', 'glyburide-metformin',
    'glipizide-metformin', 'glimepiride-pioglitazone',
    'metformin-rosiglitazone', 'metformin-pioglitazone'
]


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


@_cached
def cleaned_data(raw_diabetic_data: pd.DataFrame) -> pd.DataFrame:
    """
    Clean the dataset: handle missing values and create useful features.

    - Replace '?' with NaN
    - Create binary readmission target (30-day)
    - Create medication change flags
    - Filter out invalid gender entries

    @asset
    """
    df = raw_diabetic_data.copy()

    # Replace ? with NaN
    df = df.replace('?', np.nan)

    # Remove invalid gender
    df = df[df['gender'] != 'Unknown/Invalid']

    # Binary target: readmitted within 30 days
    df['readmit_30'] = (df['readmitted'] == '<30').astype(int)

    # Any readmission
    df['readmit_any'] = (df['readmitted'] != 'NO').astype(int)

    # Medication change flags
    for col in MEDICATION_COLS:
        df[f'{col}_changed'] = df[col].isin(['Up', 'Down']).astype(int)
        df[f'{col}_prescribed'] = (df[col] != 'No').astype(int)

    # Total medications changed
    change_cols = [f'{col}_changed' for col in MEDICATION_COLS]
    df['n_meds_changed'] = df[change_cols].sum(axis=1)

    # Any medication changed
    df['any_med_changed'] = (df['n_meds_changed'] > 0).astype(int)

    # A1C tested flag
    df['a1c_tested'] = df['A1Cresult'].notna().astype(int)

    return df


@_cached
def demographic_summary(cleaned_data: pd.DataFrame) -> pd.DataFrame:
    """
    Summary statistics by demographic groups.

    Shows readmission rates and A1C testing rates by race, gender, and age.
    """
    summaries = []

    # By race
    race_stats = cleaned_data.groupby('race').agg({
        'readmit_30': 'mean',
        'readmit_any': 'mean',
        'a1c_tested': 'mean',
        'encounter_id': 'count'
    }).rename(columns={'encounter_id': 'n'})
    race_stats['group_type'] = 'race'
    race_stats = race_stats.reset_index().rename(columns={'race': 'group'})
    summaries.append(race_stats)

    # By gender
    gender_stats = cleaned_data.groupby('gender').agg({
        'readmit_30': 'mean',
        'readmit_any': 'mean',
        'a1c_tested': 'mean',
        'encounter_id': 'count'
    }).rename(columns={'encounter_id': 'n'})
    gender_stats['group_type'] = 'gender'
    gender_stats = gender_stats.reset_index().rename(columns={'gender': 'group'})
    summaries.append(gender_stats)

    # By age
    age_stats = cleaned_data.groupby('age').agg({
        'readmit_30': 'mean',
        'readmit_any': 'mean',
        'a1c_tested': 'mean',
        'encounter_id': 'count'
    }).rename(columns={'encounter_id': 'n'})
    age_stats['group_type'] = 'age'
    age_stats = age_stats.reset_index().rename(columns={'age': 'group'})
    summaries.append(age_stats)

    return pd.concat(summaries, ignore_index=True)


@_cached
def medication_analysis(cleaned_data: pd.DataFrame) -> pd.DataFrame:
    """
    Analyze medication usage and changes vs readmission.

    For each medication, shows:
    - Prescription rate
    - Change rate (among prescribed)
    - Readmission rate by prescription status
    - Readmission rate by change status
    """
    results = []

    for med in MEDICATION_COLS:
        prescribed_col = f'{med}_prescribed'
        changed_col = f'{med}_changed'

        n_total = len(cleaned_data)
        n_prescribed = cleaned_data[prescribed_col].sum()
        n_changed = cleaned_data[changed_col].sum()

        # Readmission rates
        readmit_if_prescribed = cleaned_data[cleaned_data[prescribed_col] == 1]['readmit_30'].mean()
        readmit_if_not_prescribed = cleaned_data[cleaned_data[prescribed_col] == 0]['readmit_30'].mean()
        readmit_if_changed = cleaned_data[cleaned_data[changed_col] == 1]['readmit_30'].mean() if n_changed > 0 else np.nan

        results.append({
            'medication': med,
            'n_prescribed': n_prescribed,
            'pct_prescribed': n_prescribed / n_total * 100,
            'n_changed': n_changed,
            'pct_changed_if_prescribed': n_changed / n_prescribed * 100 if n_prescribed > 0 else 0,
            'readmit_rate_prescribed': readmit_if_prescribed,
            'readmit_rate_not_prescribed': readmit_if_not_prescribed,
            'readmit_rate_changed': readmit_if_changed,
            'readmit_diff': readmit_if_prescribed - readmit_if_not_prescribed if not np.isnan(readmit_if_prescribed) else np.nan
        })

    return pd.DataFrame(results).sort_values('n_prescribed', ascending=False)


@_cached
def admission_los_analysis(cleaned_data: pd.DataFrame) -> pd.DataFrame:
    """
    Analyze admission source and length of stay interaction.

    Groups by admission source and length of stay bins to show
    how these factors interact to affect readmission.
    """
    df = cleaned_data.copy()

    # Map admission source IDs to readable names
    admission_map = {
        1: 'Physician Referral',
        2: 'Clinic Referral',
        3: 'HMO Referral',
        4: 'Transfer: Hospital',
        5: 'Transfer: SNF',
        6: 'Transfer: Other',
        7: 'Emergency Room',
        8: 'Court/Law',
        9: 'Not Available',
        10: 'Transfer: Critical Access',
        11: 'Normal Delivery',
        12: 'Premature Delivery',
        13: 'Sick Baby',
        14: 'Extramural Birth',
        17: 'NULL',
        18: 'Transfer: Another HCF',
        19: 'Readmission: Same HCF',
        20: 'Not Mapped',
        21: 'Unknown',
        22: 'Transfer: Rehab',
        23: 'Transfer: LTCH',
        25: 'Transfer: Critical Access',
        26: 'Transfer: Ambulatory Surg'
    }

    df['admission_source'] = df['admission_source_id'].map(admission_map).fillna('Other')

    # Bin length of stay
    df['los_bin'] = pd.cut(
        df['time_in_hospital'],
        bins=[0, 2, 4, 7, 14],
        labels=['1-2 days', '3-4 days', '5-7 days', '8+ days']
    )

    # Group analysis
    result = df.groupby(['admission_source', 'los_bin']).agg({
        'readmit_30': ['mean', 'count'],
        'readmit_any': 'mean',
        'num_medications': 'mean',
        'number_diagnoses': 'mean'
    }).round(3)

    result.columns = ['readmit_30_rate', 'n', 'readmit_any_rate', 'avg_meds', 'avg_diagnoses']
    result = result.reset_index()

    # Filter to meaningful sample sizes
    result = result[result['n'] >= 50]

    return result.sort_values(['admission_source', 'los_bin'])


@_cached
def a1c_disparity_analysis(cleaned_data: pd.DataFrame) -> pd.DataFrame:
    """
    Analyze A1C testing disparities by race.

    Shows testing rates by race, controlling for clinical factors
    by stratifying on number of diagnoses and length of stay.
    """
    df = cleaned_data[cleaned_data['race'].notna()].copy()

    # Stratify by severity proxies
    df['severity'] = pd.cut(
        df['number_diagnoses'],
        bins=[0, 5, 8, 16],
        labels=['Low (1-5 dx)', 'Medium (6-8 dx)', 'High (9+ dx)']
    )

    df['los_cat'] = pd.cut(
        df['time_in_hospital'],
        bins=[0, 2, 5, 14],
        labels=['Short (1-2d)', 'Medium (3-5d)', 'Long (6+d)']
    )

    # Analyze by race and severity
    result = df.groupby(['race', 'severity']).agg({
        'a1c_tested': ['mean', 'count'],
        'readmit_30': 'mean'
    }).round(3)

    result.columns = ['a1c_test_rate', 'n', 'readmit_30_rate']
    result = result.reset_index()

    return result[result['n'] >= 100]

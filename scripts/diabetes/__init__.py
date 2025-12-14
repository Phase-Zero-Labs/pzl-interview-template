"""
Diabetes 130-US Hospitals Dataset (1999-2008)

10 years of clinical care data across 130 US hospitals.
Each row represents a diabetic patient encounter.

Source: https://archive.ics.uci.edu/dataset/296
License: CC BY 4.0
"""

import pandas as pd
from pathlib import Path


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
    data_path = Path(__file__).parent.parent.parent / "data" / "raw" / "diabetic_data.csv"
    return pd.read_csv(data_path)

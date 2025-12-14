# Sample Answers & Analysis Patterns

These aren't "correct" answers - they're examples of what thoughtful analysis might look like.

---

## Question 1: Medication Changes and Readmission

### Setup

```python
import pandas as pd
from scripts.diabetes import raw_diabetic_data

df = raw_diabetic_data()

# Medication columns
med_cols = ['metformin', 'repaglinide', 'nateglinide', 'chlorpropamide',
            'glimepiride', 'acetohexamide', 'glipizide', 'glyburide',
            'tolbutamide', 'pioglitazone', 'rosiglitazone', 'acarbose',
            'miglitol', 'troglitazone', 'tolazamide', 'examide',
            'citoglipton', 'insulin', 'glyburide-metformin',
            'glipizide-metformin', 'glimepiride-pioglitazone',
            'metformin-rosiglitazone', 'metformin-pioglitazone']

# Check values
df['insulin'].value_counts()
# No        54391
# Steady    40264
# Down       4449
# Up         2662
```

### Basic Analysis

```python
# Create binary target
df['readmit_30'] = (df['readmitted'] == '<30').astype(int)

# Create "any change" features
for col in med_cols:
    df[f'{col}_changed'] = df[col].isin(['Up', 'Down']).astype(int)

# Any medication changed
df['any_med_changed'] = df[[f'{col}_changed' for col in med_cols]].any(axis=1).astype(int)

# Cross-tab
pd.crosstab(df['any_med_changed'], df['readmit_30'], normalize='index')
```

### More Sophisticated Analysis

```python
import statsmodels.api as sm

# Logistic regression with confounders
X = df[['any_med_changed', 'time_in_hospital', 'num_medications',
        'number_diagnoses', 'num_lab_procedures']].copy()
X = sm.add_constant(X)
y = df['readmit_30']

# Handle missing (drop for simplicity)
mask = X.notna().all(axis=1)
model = sm.Logit(y[mask], X[mask]).fit()
print(model.summary())
```

### Good Insight

"Patients with medication changes have higher readmission rates, but this is confounded by disease severity. When controlling for number of diagnoses and time in hospital, the effect weakens. The causal direction is unclear - sick patients both get medication adjustments AND return to the hospital."

---

## Question 2: Admission Source and Length of Stay Interaction

### Setup

```python
# Map admission source codes
admission_map = {
    1: 'Physician Referral',
    2: 'Clinic Referral',
    3: 'HMO Referral',
    4: 'Transfer from hospital',
    5: 'Transfer from SNF',
    6: 'Transfer from other',
    7: 'Emergency Room',
    8: 'Court/Law Enforcement',
    9: 'Not Available',
    10: 'Transfer from critial access',
    # ... etc
}

df['admission_source_cat'] = df['admission_source_id'].map(admission_map)
```

### Visualization

```python
import matplotlib.pyplot as plt
from scripts.utils.visualization import setup_agc_style

setup_agc_style()

# Group by admission source and time bin
df['time_bin'] = pd.cut(df['time_in_hospital'], bins=[0, 2, 5, 10, 14],
                        labels=['1-2', '3-5', '6-10', '11-14'])

# Readmission rate by group
grouped = df.groupby(['admission_source_cat', 'time_bin'])['readmit_30'].mean().unstack()

# Heatmap or line plot
fig, ax = plt.subplots(figsize=(10, 6))
for source in ['Emergency Room', 'Physician Referral', 'Transfer from hospital']:
    if source in grouped.index:
        grouped.loc[source].plot(ax=ax, marker='o', label=source)
ax.set_xlabel('Length of Stay (days)')
ax.set_ylabel('30-day Readmission Rate')
ax.legend()
plt.title('[DIABETES] Readmission by Admission Source and Stay Length')
```

### Interaction Test

```python
# Create interaction term
df['er_admission'] = (df['admission_source_id'] == 7).astype(int)
df['er_x_time'] = df['er_admission'] * df['time_in_hospital']

X = df[['er_admission', 'time_in_hospital', 'er_x_time',
        'num_medications', 'number_diagnoses']].copy()
X = sm.add_constant(X)
y = df['readmit_30']

mask = X.notna().all(axis=1)
model = sm.Logit(y[mask], X[mask]).fit()
# Check p-value on interaction term
```

### Good Insight

"ER admissions with short stays (<3 days) have lower readmission rates than referral admissions with similar stays - possibly less complex cases. But ER admissions with long stays (>7 days) have the highest readmission rates of any group, suggesting these are high-acuity cases that need more follow-up care."

---

## Question 3: Disparities in HbA1c Testing

### Setup

```python
# Create binary "tested" variable
df['a1c_tested'] = (df['A1Cresult'] != 'None').astype(int)

# Check race distribution
df['race'].value_counts(dropna=False)
# Caucasian          76099
# AfricanAmerican    19210
# ?                   2273  <- Missing
# Hispanic            2037
# Other               1506
# Asian                641
```

### Unadjusted Rates

```python
# Raw testing rates by race
df[df['race'] != '?'].groupby('race')['a1c_tested'].agg(['mean', 'count'])
```

### Adjusted Analysis

```python
# Control for clinical factors
df_clean = df[df['race'] != '?'].copy()

# Create dummy variables for race
race_dummies = pd.get_dummies(df_clean['race'], prefix='race', drop_first=True)
df_clean = pd.concat([df_clean, race_dummies], axis=1)

# Clinical controls
controls = ['time_in_hospital', 'num_lab_procedures', 'num_medications',
            'number_diagnoses', 'num_procedures']

X = df_clean[controls + list(race_dummies.columns)].copy()
X = sm.add_constant(X)
y = df_clean['a1c_tested']

mask = X.notna().all(axis=1)
model = sm.Logit(y[mask], X[mask]).fit()
print(model.summary())

# Look at race coefficients and their significance
```

### Handling Missing Race

```python
# Option 1: Exclude (shown above)
# Option 2: Include as separate category
# Option 3: Multiple imputation (advanced)

# Check if missing race is random
df.groupby(df['race'] == '?').agg({
    'time_in_hospital': 'mean',
    'num_medications': 'mean',
    'a1c_tested': 'mean'
})
# If systematic differences, missingness may be informative
```

### Good Insight

"Unadjusted testing rates show African American patients are tested less frequently than Caucasian patients (X% vs Y%). After controlling for clinical factors, the gap narrows but remains significant (OR = Z, p < 0.01). However, we can't distinguish between provider-level bias, patient preference, or unmeasured confounders like insurance type or hospital effects. The missing race data (~2.3%) doesn't appear random - those patients have different clinical profiles."

---

## Open Exploration Ideas

### ICD-9 Code Analysis

```python
# Top primary diagnoses
df['diag_1'].value_counts().head(20)

# Diabetes codes (250.xx)
df['is_primary_diabetes'] = df['diag_1'].str.startswith('250').fillna(False)

# Circulatory codes (390-459)
df['primary_circ'] = df['diag_1'].apply(
    lambda x: 390 <= int(x[:3]) <= 459 if pd.notna(x) and x[:3].isdigit() else False
)
```

### Payer Analysis

```python
# Note: payer_code has many missing values
df['payer_code'].value_counts()

# Compare outcomes by payer (if available)
df.groupby('payer_code')['readmit_30'].agg(['mean', 'count']).sort_values('count', ascending=False)
```

### Temporal Patterns

```python
# Encounter ID might encode time
# Number_outpatient/inpatient/emergency might show healthcare utilization patterns

df[['number_outpatient', 'number_inpatient', 'number_emergency']].describe()

# High utilizers
df['total_prior_encounters'] = df['number_outpatient'] + df['number_inpatient'] + df['number_emergency']
df.groupby(pd.cut(df['total_prior_encounters'], bins=[0, 0, 1, 5, 10, 100]))['readmit_30'].mean()
```

---

## What Makes an Answer "Good"

1. **Shows their work** - Code is clear, variables are named sensibly
2. **Acknowledges limitations** - Confounding, missing data, causality
3. **Iterates** - Doesn't stop at first result, explores further
4. **Clinical sense** - Results are interpreted in context
5. **Appropriate methods** - Matches analysis to question type

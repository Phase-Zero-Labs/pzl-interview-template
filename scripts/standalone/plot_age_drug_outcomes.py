"""
Correlate age groups, drugs, and outcome measures.
Creates heatmaps stratified by age group.
"""

import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from pathlib import Path

# Configure matplotlib
plt.rcParams['font.family'] = 'monospace'
plt.rcParams['font.monospace'] = ['Berkeley Mono', 'SF Mono', 'Menlo', 'Monaco', 'Consolas', 'Courier New']
plt.rcParams['font.size'] = 10
plt.rcParams['axes.linewidth'] = 1.5
plt.rcParams['axes.edgecolor'] = '#333333'
plt.rcParams['axes.labelcolor'] = '#333333'
plt.rcParams['axes.titleweight'] = 'bold'
plt.rcParams['xtick.color'] = '#333333'
plt.rcParams['ytick.color'] = '#333333'
plt.rcParams['text.color'] = '#333333'
plt.rcParams['figure.facecolor'] = '#FAFAFA'
plt.rcParams['axes.facecolor'] = '#FFFFFF'


def load_data():
    data_path = Path(__file__).parent.parent / "data" / "raw" / "diabetic_data.csv"
    return pd.read_csv(data_path)


def get_medication_columns():
    return [
        'metformin', 'repaglinide', 'nateglinide', 'chlorpropamide',
        'glimepiride', 'glipizide', 'glyburide', 'pioglitazone',
        'rosiglitazone', 'acarbose', 'insulin'
    ]


def create_outcome_targets(df):
    """Create binary/numeric outcome targets."""
    outcomes = pd.DataFrame()

    # Readmission targets
    outcomes['readmit_30'] = (df['readmitted'] == '<30').astype(int)
    outcomes['readmit_any'] = (df['readmitted'] != 'NO').astype(int)

    # Discharge outcomes
    outcomes['discharged_home'] = (df['discharge_disposition_id'] == 1).astype(int)
    outcomes['expired'] = (df['discharge_disposition_id'] == 11).astype(int)
    outcomes['hospice'] = df['discharge_disposition_id'].isin([13, 14]).astype(int)

    # Severity proxies
    outcomes['long_stay'] = (df['time_in_hospital'] >= 7).astype(int)  # >1 week
    outcomes['high_meds'] = (df['num_medications'] >= 20).astype(int)  # high medication burden
    outcomes['prior_inpatient'] = (df['number_inpatient'] >= 1).astype(int)
    outcomes['prior_emergency'] = (df['number_emergency'] >= 1).astype(int)
    outcomes['med_changed'] = (df['change'] == 'Ch').astype(int)

    return outcomes


def create_drug_features(df, med_cols):
    """Create binary features for drug dosage changes."""
    features = pd.DataFrame()

    for col in med_cols:
        features[f'{col}_up'] = (df[col] == 'Up').astype(int)
        features[f'{col}_down'] = (df[col] == 'Down').astype(int)
        features[f'{col}_on'] = df[col].isin(['Up', 'Down', 'Steady']).astype(int)  # on the drug

    return features


def calculate_outcome_rates(df, drug_features, outcomes, age_group=None):
    """
    Calculate outcome rates for each drug feature.
    Returns a matrix: rows=drug features, cols=outcomes
    """
    if age_group:
        mask = df['age'] == age_group
        drug_features = drug_features[mask]
        outcomes = outcomes[mask]

    results = {}

    for drug_col in drug_features.columns:
        drug_mask = drug_features[drug_col] == 1
        if drug_mask.sum() < 50:  # skip if too few samples
            results[drug_col] = {out: np.nan for out in outcomes.columns}
            continue

        results[drug_col] = {}
        for out_col in outcomes.columns:
            # Rate when drug feature is present
            rate_with = outcomes.loc[drug_mask, out_col].mean()
            # Rate when drug feature is absent
            rate_without = outcomes.loc[~drug_mask, out_col].mean()
            # Difference (positive = drug associated with higher outcome rate)
            results[drug_col][out_col] = (rate_with - rate_without) * 100

    return pd.DataFrame(results).T


def plot_heatmap(matrix, title, output_path, figsize=(14, 10)):
    """Plot outcome rate difference heatmap."""
    fig, ax = plt.subplots(figsize=figsize)

    # Handle NaN for colormap
    matrix_plot = matrix.fillna(0)

    vmax = max(abs(matrix_plot.min().min()), abs(matrix_plot.max().max()))
    vmax = max(vmax, 5)  # minimum range of 5%

    im = ax.imshow(matrix_plot.values, cmap='RdBu_r', aspect='auto', vmin=-vmax, vmax=vmax)

    cbar = plt.colorbar(im, ax=ax, shrink=0.8)
    cbar.set_label('RATE DIFFERENCE (%)', fontweight='bold')

    # Labels
    ax.set_xticks(range(len(matrix.columns)))
    ax.set_yticks(range(len(matrix.index)))
    ax.set_xticklabels([c.upper().replace('_', '\n') for c in matrix.columns],
                       fontsize=8, rotation=45, ha='right')
    ax.set_yticklabels(matrix.index, fontsize=8)

    # Add values
    for i in range(len(matrix.index)):
        for j in range(len(matrix.columns)):
            val = matrix.iloc[i, j]
            if pd.isna(val):
                text = 'n/a'
                color = 'gray'
            else:
                text = f'{val:.1f}'
                color = 'white' if abs(val) > vmax * 0.6 else 'black'
            ax.text(j, i, text, ha='center', va='center', fontsize=6, color=color)

    ax.set_title(title, fontsize=12, fontweight='bold', pad=15)
    ax.set_xlabel('OUTCOME', fontsize=10, fontweight='bold')
    ax.set_ylabel('DRUG CHANGE', fontsize=10, fontweight='bold')

    for spine in ax.spines.values():
        spine.set_linewidth(2)
        spine.set_color('#000000')

    plt.tight_layout()
    fig.savefig(output_path, dpi=150, bbox_inches='tight', facecolor='#FAFAFA')
    plt.close(fig)

    return fig


def plot_summary_by_age(all_results, outcome_col, output_path):
    """Plot a single outcome across all age groups and drugs."""
    age_groups = list(all_results.keys())

    # Get drug names (just the main drugs, not _up/_down variants)
    drugs = ['metformin', 'insulin', 'glipizide', 'glyburide', 'pioglitazone']

    fig, axes = plt.subplots(1, len(drugs), figsize=(16, 6), sharey=True)

    for idx, drug in enumerate(drugs):
        ax = axes[idx]

        x = np.arange(len(age_groups))
        width = 0.35

        up_vals = [all_results[age].loc[f'{drug}_up', outcome_col]
                   if f'{drug}_up' in all_results[age].index else np.nan
                   for age in age_groups]
        down_vals = [all_results[age].loc[f'{drug}_down', outcome_col]
                     if f'{drug}_down' in all_results[age].index else np.nan
                     for age in age_groups]

        bars1 = ax.bar(x - width/2, up_vals, width, label='DOSE UP',
                       color='#FF3366', edgecolor='#000000', linewidth=1.5)
        bars2 = ax.bar(x + width/2, down_vals, width, label='DOSE DOWN',
                       color='#0066CC', edgecolor='#000000', linewidth=1.5)

        ax.axhline(y=0, color='black', linestyle='-', linewidth=1)
        ax.set_xlabel('AGE GROUP', fontsize=9, fontweight='bold')
        ax.set_title(drug.upper(), fontsize=10, fontweight='bold')
        ax.set_xticks(x)
        ax.set_xticklabels([a.replace('[', '').replace(')', '') for a in age_groups],
                          rotation=45, ha='right', fontsize=7)
        ax.grid(axis='y', linestyle='--', alpha=0.7)

        if idx == 0:
            ax.set_ylabel(f'{outcome_col.upper()}\nRATE DIFF (%)', fontsize=9, fontweight='bold')
        if idx == len(drugs) - 1:
            ax.legend(loc='upper right', fontsize=8)

    fig.suptitle(f'[DRUG EFFECTS ON {outcome_col.upper()}] BY AGE GROUP',
                 fontsize=14, fontweight='bold', y=1.02)
    plt.tight_layout()
    fig.savefig(output_path, dpi=150, bbox_inches='tight', facecolor='#FAFAFA')
    plt.close(fig)

    return fig


if __name__ == "__main__":
    print("Loading data...")
    df = load_data()

    med_cols = get_medication_columns()
    print(f"Analyzing {len(med_cols)} medications")

    print("Creating outcome targets...")
    outcomes = create_outcome_targets(df)
    print(f"Outcomes: {list(outcomes.columns)}")

    print("Creating drug features...")
    drug_features = create_drug_features(df, med_cols)

    output_dir = Path(__file__).parent.parent / "results" / "figures"
    output_dir.mkdir(parents=True, exist_ok=True)

    # Define age groups
    age_groups = ['[30-40)', '[40-50)', '[50-60)', '[60-70)', '[70-80)', '[80-90)']

    # Calculate for each age group
    all_results = {}

    for age in age_groups:
        print(f"\nProcessing age group {age}...")
        n_patients = (df['age'] == age).sum()
        print(f"  {n_patients} patients")

        result = calculate_outcome_rates(df, drug_features, outcomes, age)
        all_results[age] = result

        # Save individual heatmap
        plot_heatmap(
            result,
            f'[AGE {age}] DRUG-OUTCOME ASSOCIATIONS (N={n_patients})',
            output_dir / f'drug_outcomes_age_{age.replace("[", "").replace(")", "")}.png'
        )

    # Overall (all ages)
    print("\nProcessing all ages...")
    result_all = calculate_outcome_rates(df, drug_features, outcomes)
    all_results['ALL'] = result_all

    plot_heatmap(
        result_all,
        '[ALL AGES] DRUG-OUTCOME ASSOCIATIONS',
        output_dir / 'drug_outcomes_all_ages.png'
    )
    print(f"Saved: drug_outcomes_all_ages.png")

    # Summary plots by outcome
    for outcome in ['readmit_30', 'expired', 'long_stay']:
        print(f"\nCreating summary plot for {outcome}...")
        plot_summary_by_age(
            {k: v for k, v in all_results.items() if k != 'ALL'},
            outcome,
            output_dir / f'drug_{outcome}_by_age.png'
        )
        print(f"Saved: drug_{outcome}_by_age.png")

    print("\n=== TOP ASSOCIATIONS (ALL AGES) ===")
    # Flatten and sort
    flat = result_all.stack().sort_values()
    print("\nMost negative (drug reduces outcome):")
    print(flat.head(10))
    print("\nMost positive (drug increases outcome):")
    print(flat.tail(10))

    print("\nDone!")

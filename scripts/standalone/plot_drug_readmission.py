"""
Correlation between drug dosage changes and readmission outcomes.
Creates separate heatmaps for <30 day and >30 day readmission.
"""

import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from pathlib import Path

# Configure matplotlib for monospace/retro aesthetic
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
plt.rcParams['grid.color'] = '#E0E0E0'
plt.rcParams['grid.linestyle'] = '-'
plt.rcParams['grid.linewidth'] = 0.5


def load_data():
    """Load diabetic data."""
    data_path = Path(__file__).parent.parent / "data" / "raw" / "diabetic_data.csv"
    return pd.read_csv(data_path)


def get_medication_columns(df):
    """Get list of medication columns."""
    # These are the 23 medication columns
    med_cols = [
        'metformin', 'repaglinide', 'nateglinide', 'chlorpropamide',
        'glimepiride', 'acetohexamide', 'glipizide', 'glyburide',
        'tolbutamide', 'pioglitazone', 'rosiglitazone', 'acarbose',
        'miglitol', 'troglitazone', 'tolazamide', 'examide',
        'citoglipton', 'insulin', 'glyburide-metformin',
        'glipizide-metformin', 'glimepiride-pioglitazone',
        'metformin-rosiglitazone', 'metformin-pioglitazone'
    ]
    return [c for c in med_cols if c in df.columns]


def create_drug_features(df, med_cols):
    """
    Create binary features for each drug dosage change type.
    Returns DataFrame with columns like 'metformin_up', 'metformin_down', etc.
    """
    features = {}

    for col in med_cols:
        features[f'{col}_up'] = (df[col] == 'Up').astype(int)
        features[f'{col}_down'] = (df[col] == 'Down').astype(int)
        features[f'{col}_steady'] = (df[col] == 'Steady').astype(int)
        features[f'{col}_no'] = (df[col] == 'No').astype(int)

    return pd.DataFrame(features)


def calculate_readmission_correlation(df, drug_features, readmission_type):
    """
    Calculate correlation between drug features and a specific readmission outcome.

    readmission_type: '<30' or '>30'
    """
    # Binary target: 1 if readmitted within specified time, 0 otherwise
    target = (df['readmitted'] == readmission_type).astype(int)

    correlations = {}
    for col in drug_features.columns:
        correlations[col] = drug_features[col].corr(target)

    return correlations


def create_correlation_matrix(correlations, med_cols, title):
    """
    Create a heatmap matrix with drugs as rows and change types as columns.
    """
    # Reshape correlations into matrix form
    change_types = ['up', 'down', 'steady', 'no']

    matrix = np.zeros((len(med_cols), len(change_types)))

    for i, drug in enumerate(med_cols):
        for j, change in enumerate(change_types):
            key = f'{drug}_{change}'
            matrix[i, j] = correlations.get(key, 0)

    return matrix, change_types


def plot_heatmap(matrix, med_cols, change_types, title, output_path):
    """Plot correlation heatmap."""
    fig, ax = plt.subplots(figsize=(8, 12))

    # Use diverging colormap centered at 0
    vmax = max(abs(matrix.min()), abs(matrix.max()))
    vmax = max(vmax, 0.05)  # Ensure some range

    im = ax.imshow(matrix, cmap='RdBu_r', aspect='auto', vmin=-vmax, vmax=vmax)

    # Add colorbar
    cbar = plt.colorbar(im, ax=ax, shrink=0.6)
    cbar.set_label('CORRELATION', fontweight='bold')

    # Set ticks
    ax.set_xticks(range(len(change_types)))
    ax.set_yticks(range(len(med_cols)))
    ax.set_xticklabels([c.upper() for c in change_types], fontsize=10, fontweight='bold')
    ax.set_yticklabels([m.upper() for m in med_cols], fontsize=9)

    # Add correlation values as text
    for i in range(len(med_cols)):
        for j in range(len(change_types)):
            val = matrix[i, j]
            color = 'white' if abs(val) > vmax * 0.6 else 'black'
            ax.text(j, i, f'{val:.3f}', ha='center', va='center',
                   fontsize=8, color=color, fontweight='bold')

    ax.set_title(title, fontsize=14, fontweight='bold', pad=20)
    ax.set_xlabel('DOSAGE CHANGE', fontsize=11, fontweight='bold')
    ax.set_ylabel('MEDICATION', fontsize=11, fontweight='bold')

    # Add border
    for spine in ax.spines.values():
        spine.set_linewidth(2)
        spine.set_color('#000000')

    plt.tight_layout()
    fig.savefig(output_path, dpi=150, bbox_inches='tight', facecolor='#FAFAFA')
    plt.close(fig)

    return fig


if __name__ == "__main__":
    print("Loading data...")
    df = load_data()

    print("Getting medication columns...")
    med_cols = get_medication_columns(df)
    print(f"Found {len(med_cols)} medication columns")

    print("Creating drug features...")
    drug_features = create_drug_features(df, med_cols)

    # Create output directory
    output_dir = Path(__file__).parent.parent / "results" / "figures"
    output_dir.mkdir(parents=True, exist_ok=True)

    # Calculate correlations for <30 day readmission
    print("\nCalculating correlations for <30 day readmission...")
    corr_30 = calculate_readmission_correlation(df, drug_features, '<30')
    matrix_30, change_types = create_correlation_matrix(corr_30, med_cols, '<30')

    plot_heatmap(
        matrix_30, med_cols, change_types,
        '[READMISSION <30 DAYS] DRUG DOSAGE CORRELATION',
        output_dir / 'drug_readmission_30.png'
    )
    print(f"Saved: {output_dir / 'drug_readmission_30.png'}")

    # Calculate correlations for >30 day readmission
    print("\nCalculating correlations for >30 day readmission...")
    corr_gt30 = calculate_readmission_correlation(df, drug_features, '>30')
    matrix_gt30, _ = create_correlation_matrix(corr_gt30, med_cols, '>30')

    plot_heatmap(
        matrix_gt30, med_cols, change_types,
        '[READMISSION >30 DAYS] DRUG DOSAGE CORRELATION',
        output_dir / 'drug_readmission_gt30.png'
    )
    print(f"Saved: {output_dir / 'drug_readmission_gt30.png'}")

    # Print top correlations
    print("\n--- Top Correlations for <30 Day Readmission ---")
    sorted_corr = sorted(corr_30.items(), key=lambda x: abs(x[1]), reverse=True)[:10]
    for k, v in sorted_corr:
        print(f"  {k}: {v:.4f}")

    print("\n--- Top Correlations for >30 Day Readmission ---")
    sorted_corr = sorted(corr_gt30.items(), key=lambda x: abs(x[1]), reverse=True)[:10]
    for k, v in sorted_corr:
        print(f"  {k}: {v:.4f}")

    print("\nDone!")

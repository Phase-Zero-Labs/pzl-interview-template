"""
Plot all diabetic data with categorical values converted to numeric.
"""

import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from pathlib import Path
from sklearn.preprocessing import LabelEncoder

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


def load_and_encode_data():
    """Load diabetic data and convert all categorical columns to numeric."""
    data_path = Path(__file__).parent.parent / "data" / "raw" / "diabetic_data.csv"
    df = pd.read_csv(data_path)

    # Create a copy for encoding
    df_encoded = df.copy()

    # Track encoders for reference
    encoders = {}

    # Encode all object columns
    for col in df.columns:
        if df[col].dtype == 'object':
            le = LabelEncoder()
            # Handle missing values (marked as '?')
            df_encoded[col] = df[col].fillna('missing')
            df_encoded[col] = le.fit_transform(df_encoded[col].astype(str))
            encoders[col] = dict(zip(le.classes_, le.transform(le.classes_)))

    return df_encoded, encoders


def plot_correlation_matrix(df_encoded):
    """Plot correlation matrix heatmap."""
    # Calculate correlation matrix
    corr = df_encoded.corr()

    fig, ax = plt.subplots(figsize=(16, 14))

    im = ax.imshow(corr, cmap='RdBu_r', aspect='auto', vmin=-1, vmax=1)

    # Add colorbar
    cbar = plt.colorbar(im, ax=ax, shrink=0.8)
    cbar.set_label('CORRELATION', fontweight='bold')

    # Set ticks
    ax.set_xticks(range(len(corr.columns)))
    ax.set_yticks(range(len(corr.columns)))
    ax.set_xticklabels(corr.columns, rotation=90, fontsize=7)
    ax.set_yticklabels(corr.columns, fontsize=7)

    ax.set_title('[DIABETIC DATA] CORRELATION MATRIX', fontsize=14, fontweight='bold', pad=20)

    plt.tight_layout()
    return fig


def plot_histograms(df_encoded):
    """Plot histograms for all columns."""
    n_cols = len(df_encoded.columns)
    n_rows = (n_cols + 4) // 5  # 5 columns per row

    fig, axes = plt.subplots(n_rows, 5, figsize=(20, n_rows * 3))
    axes = axes.flatten()

    colors = ['#0066CC', '#FF3366', '#FF9900', '#666666', '#0066CC']

    for i, col in enumerate(df_encoded.columns):
        ax = axes[i]
        ax.hist(df_encoded[col].dropna(), bins=30, color=colors[i % len(colors)],
                edgecolor='#000000', linewidth=1.0, alpha=0.9)
        ax.set_title(col.upper()[:20], fontsize=8, fontweight='bold')
        ax.tick_params(labelsize=6)
        ax.grid(True, axis='y', linestyle='--', alpha=0.7)

    # Hide unused subplots
    for j in range(i + 1, len(axes)):
        axes[j].set_visible(False)

    fig.suptitle('[DIABETIC DATA] FEATURE DISTRIBUTIONS', fontsize=14, fontweight='bold', y=1.02)
    plt.tight_layout()
    return fig


def plot_pairwise_scatter(df_encoded, n_features=8):
    """Plot pairwise scatter for top numeric features."""
    # Select a subset of interesting numeric columns
    cols_of_interest = [
        'time_in_hospital', 'num_lab_procedures', 'num_procedures',
        'num_medications', 'number_diagnoses', 'number_inpatient',
        'number_emergency', 'readmitted'
    ]

    cols_available = [c for c in cols_of_interest if c in df_encoded.columns][:n_features]

    n = len(cols_available)
    fig, axes = plt.subplots(n, n, figsize=(14, 14))

    # Sample data for faster plotting
    sample = df_encoded[cols_available].sample(n=min(5000, len(df_encoded)), random_state=42)

    for i, col_y in enumerate(cols_available):
        for j, col_x in enumerate(cols_available):
            ax = axes[i, j]
            if i == j:
                # Diagonal: histogram
                ax.hist(sample[col_x], bins=20, color='#0066CC', edgecolor='#000000', linewidth=0.5)
            else:
                # Off-diagonal: scatter
                ax.scatter(sample[col_x], sample[col_y], alpha=0.3, s=5, c='#FF3366', edgecolors='none')

            if i == n - 1:
                ax.set_xlabel(col_x[:12], fontsize=7)
            if j == 0:
                ax.set_ylabel(col_y[:12], fontsize=7)

            ax.tick_params(labelsize=5)

    fig.suptitle('[DIABETIC DATA] PAIRWISE RELATIONSHIPS', fontsize=14, fontweight='bold', y=1.01)
    plt.tight_layout()
    return fig


if __name__ == "__main__":
    print("Loading and encoding data...")
    df_encoded, encoders = load_and_encode_data()

    print(f"Shape: {df_encoded.shape}")
    print(f"Encoded {len(encoders)} categorical columns")

    # Create output directory
    output_dir = Path(__file__).parent.parent / "results" / "figures"
    output_dir.mkdir(parents=True, exist_ok=True)

    print("\nPlotting correlation matrix...")
    fig1 = plot_correlation_matrix(df_encoded)
    fig1.savefig(output_dir / "diabetic_correlation.png", dpi=150, bbox_inches='tight', facecolor='#FAFAFA')
    print(f"Saved: {output_dir / 'diabetic_correlation.png'}")

    print("\nPlotting histograms...")
    fig2 = plot_histograms(df_encoded)
    fig2.savefig(output_dir / "diabetic_histograms.png", dpi=150, bbox_inches='tight', facecolor='#FAFAFA')
    print(f"Saved: {output_dir / 'diabetic_histograms.png'}")

    print("\nPlotting pairwise scatter...")
    fig3 = plot_pairwise_scatter(df_encoded)
    fig3.savefig(output_dir / "diabetic_pairwise.png", dpi=150, bbox_inches='tight', facecolor='#FAFAFA')
    print(f"Saved: {output_dir / 'diabetic_pairwise.png'}")

    print("\nDone! Figures saved to results/figures/")

    # Print encoding mappings for reference
    print("\n--- Encoding Reference ---")
    print("readmitted:", encoders.get('readmitted', 'N/A'))

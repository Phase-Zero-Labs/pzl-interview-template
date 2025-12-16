"""
RNA-seq Drug Screening Dataset

Gene expression data from drug screening experiments testing
ADCs (antibody-drug conjugates) and free cytotoxic payloads.

Data:
- 52 samples across 3 plates
- 78,932 genes (Salmon quantification)
- 14 compounds at various concentrations
"""

import pandas as pd
from pathlib import Path as _Path
from functools import wraps as _wraps


# =============================================================================
# Caching utilities (prefixed with _ to hide from Hamilton)
# =============================================================================

_CACHE_DIR = _Path(__file__).parent.parent / "results" / "cache"


def _cached(func):
    """
    Decorator that caches DataFrame outputs as parquet files.

    Cache is stored in results/cache/{function_name}.parquet
    The cache is automatically invalidated when the pipeline is re-run.
    """
    @_wraps(func)
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
def sample_metadata() -> pd.DataFrame:
    """
    Load sample metadata for drug screening experiment.

    Returns a DataFrame with 60 samples across 3 plates (NEC03 P1, NEC03 P2, OD48 P3)
    testing various compounds at different concentrations:

    Compounds tested:
    - ADCs: Enhertu, Trodelvy, PADCEV, NTX1105Exatecan, NTX1105MMAE, 9B5
    - Free drugs: Free exatecan, Free MMAE
    - Controls: Ctrl, Dex w Cyt (various combinations)

    Columns:
    - sample_id: Sample identifier (TD009_X format)
    - plate: Plate identifier (NEC03 P1, NEC03 P2, OD48 P3)
    - compound: Drug/compound name
    - concentration: Drug concentration (nM)
    - well_ids: Plate well positions

    @asset
    """
    data_path = _Path(__file__).parent.parent / "data" / "raw" / "Samples ID.xlsx"
    df = pd.read_excel(data_path, skiprows=2)

    # Clean up column names
    df = df.rename(columns={
        'sample ID in Savyon': 'sample_id',
        'Screen WellID': 'well_ids',
        'Plate': 'plate',
        'Compound': 'compound',
        'Conc': 'concentration'
    })

    # Keep only relevant columns
    df = df[['sample_id', 'plate', 'compound', 'concentration', 'well_ids']].copy()

    # Drop rows without sample_id
    df = df.dropna(subset=['sample_id'])

    # Forward fill plate info
    df['plate'] = df['plate'].ffill()

    # Clean compound names (strip whitespace)
    df['compound'] = df['compound'].str.strip()

    # Normalize sample IDs (some use . instead of _ for replicates)
    df['sample_id'] = df['sample_id'].str.replace('.', '_', regex=False)

    return df


@_cached
def raw_gene_counts() -> pd.DataFrame:
    """
    Load raw Salmon gene counts from RNA-seq experiment.

    Returns a DataFrame with 78,932 genes x 52 samples.
    Counts are from Salmon quantification (transcript-level, merged to gene).

    Structure:
    - gene_id: Ensembl gene ID (ENSG...)
    - gene_name: Gene symbol (e.g., TSPAN6, BRCA1)
    - TD009_X columns: Raw counts per sample

    Note: Counts may have decimal values due to Salmon's expectation-maximization
    algorithm for multi-mapped reads.

    @asset
    """
    data_path = _Path(__file__).parent.parent / "data" / "raw" / "salmon_gene_counts.tsv"
    return pd.read_csv(data_path, sep='\t')

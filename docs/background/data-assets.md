# Data Assets & Lineage - Curated Links

Modern data engineering treats datasets as "assets" with clear ownership, lineage, and quality guarantees.

---

## Core Concepts

### What is a Data Asset?
A named, versioned dataset with:
- **Lineage**: Where did this data come from?
- **Schema**: What columns/types does it have?
- **Quality**: What guarantees can we make?
- **Documentation**: What does this data mean?

### What is Lineage?
The complete history of how data was produced. If `summary_stats` depends on `cleaned_data` which depends on `raw_data`, the lineage shows that chain.

---

## Data Mesh & Architecture

- **[Data Mesh Principles](https://martinfowler.com/articles/data-mesh-principles.html)** - Zhamak Dehghani's foundational article on treating data as a product.

- **[How to Move Beyond a Monolithic Data Lake](https://martinfowler.com/articles/data-monolith-to-mesh.html)** - The original Data Mesh article.

---

## Lineage & Catalogs

- **[dbt: Data Lineage](https://docs.getdbt.com/terms/data-lineage)** - dbt's explanation of lineage with examples.

- **[OpenLineage](https://openlineage.io/)** - Open standard for tracking data lineage across tools.

- **[DataHub](https://datahubproject.io/)** - LinkedIn's open-source data catalog with lineage tracking.

---

## Data Quality

- **[Great Expectations](https://greatexpectations.io/expectations/)** - Define and validate data quality expectations.

- **[Pandera](https://pandera.readthedocs.io/)** - Schema validation for pandas DataFrames (integrates with Hamilton).

- **[dbt Tests](https://docs.getdbt.com/docs/build/data-tests)** - Testing data transformations.

---

## Testing Data Pipelines

- **[Testing Data Pipelines](https://medium.com/databand-labs/testing-data-pipelines-what-why-and-how-65e70fa9ba74)** - Overview of testing strategies.

- **[Hamilton Testing](https://hamilton.dagworks.io/en/latest/how-tos/test-your-hamilton-code/)** - How to test Hamilton functions.

---

## In This Template

Hamilton functions become assets when tagged:

```python
def cleaned_diabetic_data(raw_diabetic_data: pd.DataFrame) -> pd.DataFrame:
    """
    Remove invalid entries and standardize missing values.

    @asset
    """
    return raw_diabetic_data.replace("?", pd.NA).dropna(subset=["race", "gender"])
```

The `@asset` tag registers this in the template's data catalog.

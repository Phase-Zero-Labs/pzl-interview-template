"""
Abstract data source interface for Hamilton pipelines.

Users implement their own data sources by:
1. Subclassing the DataSource protocol
2. Implementing required methods
3. Providing a factory function for Hamilton nodes

Examples:
    # CSV files
    source = CSVDataSource(Path("./data/raw"))
    df = source.get_table("users")

    # PostgreSQL (requires optional dependencies)
    source = PostgreSQLDataSource.from_env()
    df = source.query("SELECT * FROM users WHERE active = true")
"""

from abc import ABC, abstractmethod
from pathlib import Path
from typing import Protocol, runtime_checkable

import pandas as pd


@runtime_checkable
class DataSource(Protocol):
    """Protocol defining the interface for data sources.

    Implement this protocol to connect to your own data:
    - CSV/Parquet files
    - PostgreSQL databases
    - REST APIs
    - Cloud storage (S3, GCS, etc.)
    """

    def query(self, sql: str, params: dict | None = None) -> pd.DataFrame:
        """Execute a query and return results as DataFrame."""
        ...

    def get_table(self, table_name: str) -> pd.DataFrame:
        """Fetch entire table/dataset as DataFrame."""
        ...

    def list_tables(self) -> list[str]:
        """List available tables/datasets."""
        ...


# =============================================================================
# File-Based Implementations
# =============================================================================


class CSVDataSource:
    """Load data from CSV files in a directory.

    Each CSV file represents a "table". The filename (without extension)
    becomes the table name.

    Usage:
        source = CSVDataSource(Path("./data/raw"))
        df = source.get_table("users")  # Reads data/raw/users.csv
    """

    def __init__(self, data_dir: Path | str):
        self.data_dir = Path(data_dir)
        if not self.data_dir.exists():
            raise ValueError(f"Data directory does not exist: {data_dir}")

    def query(self, sql: str, params: dict | None = None) -> pd.DataFrame:
        """Not supported - CSVDataSource doesn't support SQL queries.

        For SQL on CSV files, consider using DuckDB or SQLite.
        """
        raise NotImplementedError(
            "CSVDataSource doesn't support SQL queries. "
            "Use get_table() instead, or switch to PostgreSQLDataSource."
        )

    def get_table(self, table_name: str) -> pd.DataFrame:
        """Read a table from CSV or Parquet file.

        Looks for files in order: {table_name}.parquet, {table_name}.csv
        """
        parquet_path = self.data_dir / f"{table_name}.parquet"
        csv_path = self.data_dir / f"{table_name}.csv"

        if parquet_path.exists():
            return pd.read_parquet(parquet_path)
        elif csv_path.exists():
            return pd.read_csv(csv_path)
        else:
            raise FileNotFoundError(
                f"No CSV or Parquet file for table '{table_name}' in {self.data_dir}. "
                f"Expected: {csv_path} or {parquet_path}"
            )

    def list_tables(self) -> list[str]:
        """List available tables (files without extension)."""
        tables = set()
        for f in self.data_dir.iterdir():
            if f.suffix in (".csv", ".parquet"):
                tables.add(f.stem)
        return sorted(tables)

    def __repr__(self) -> str:
        return f"CSVDataSource('{self.data_dir}')"


class ParquetDataSource:
    """Load data from Parquet files.

    Parquet is recommended for larger datasets due to:
    - Columnar storage (faster queries on specific columns)
    - Built-in compression
    - Type preservation
    """

    def __init__(self, data_dir: Path | str):
        self.data_dir = Path(data_dir)

    def query(self, sql: str, params: dict | None = None) -> pd.DataFrame:
        """Not directly supported. Consider using DuckDB for SQL on Parquet."""
        raise NotImplementedError(
            "ParquetDataSource doesn't support SQL queries directly. "
            "For SQL on Parquet, consider using DuckDB: "
            "import duckdb; duckdb.query('SELECT * FROM read_parquet(...)').df()"
        )

    def get_table(self, table_name: str) -> pd.DataFrame:
        """Read a Parquet file as a table."""
        path = self.data_dir / f"{table_name}.parquet"
        if not path.exists():
            raise FileNotFoundError(f"Parquet file not found: {path}")
        return pd.read_parquet(path)

    def list_tables(self) -> list[str]:
        """List available Parquet files."""
        return [f.stem for f in self.data_dir.glob("*.parquet")]

    def __repr__(self) -> str:
        return f"ParquetDataSource('{self.data_dir}')"


# =============================================================================
# Database Implementations (require optional dependencies)
# =============================================================================


class PostgreSQLDataSource:
    """PostgreSQL data source using SQLAlchemy.

    Requires: pip install sqlalchemy psycopg2-binary

    Usage:
        # From environment variable
        source = PostgreSQLDataSource.from_env()
        df = source.query("SELECT * FROM users WHERE active = true")

        # Direct connection string
        source = PostgreSQLDataSource("postgresql://user:pass@localhost:5432/dbname")
        df = source.get_table("users")
    """

    def __init__(self, connection_string: str):
        self.connection_string = connection_string
        self._engine = None

    @classmethod
    def from_env(cls, env_var: str = "DATABASE_URL") -> "PostgreSQLDataSource":
        """Create from environment variable.

        Args:
            env_var: Name of environment variable containing connection string.
                     Defaults to DATABASE_URL.
        """
        import os

        url = os.getenv(env_var)
        if not url:
            raise ValueError(
                f"Environment variable '{env_var}' not set. "
                f"Set it to your PostgreSQL connection string, e.g.: "
                f"export {env_var}=postgresql://user:pass@localhost:5432/dbname"
            )
        return cls(url)

    @property
    def engine(self):
        """Lazy-load SQLAlchemy engine."""
        if self._engine is None:
            try:
                from sqlalchemy import create_engine
            except ImportError:
                raise ImportError(
                    "SQLAlchemy is required for PostgreSQL. "
                    "Install with: pip install sqlalchemy psycopg2-binary"
                )
            self._engine = create_engine(self.connection_string)
        return self._engine

    def query(self, sql: str, params: dict | None = None) -> pd.DataFrame:
        """Execute SQL query and return results as DataFrame."""
        from sqlalchemy import text

        with self.engine.connect() as conn:
            if params:
                return pd.read_sql(text(sql), conn, params=params)
            return pd.read_sql(sql, conn)

    def get_table(self, table_name: str, schema: str = "public") -> pd.DataFrame:
        """Fetch entire table as DataFrame."""
        return self.query(f"SELECT * FROM {schema}.{table_name}")

    def list_tables(self, schema: str = "public") -> list[str]:
        """List tables in schema."""
        df = self.query(
            """
            SELECT table_name FROM information_schema.tables
            WHERE table_schema = :schema
            ORDER BY table_name
        """,
            {"schema": schema},
        )
        return df["table_name"].tolist()

    def __repr__(self) -> str:
        # Hide password in repr
        import re
        safe_url = re.sub(r"://[^:]+:[^@]+@", "://*****:*****@", self.connection_string)
        return f"PostgreSQLDataSource('{safe_url}')"


# =============================================================================
# Factory Functions for Hamilton
# =============================================================================


def create_csv_source(data_dir: str = "./data/raw") -> CSVDataSource:
    """Factory function for CSV data source.

    Use this in your Hamilton module:

        def data_source() -> DataSource:
            return create_csv_source("./data/raw")
    """
    return CSVDataSource(Path(data_dir))


def create_parquet_source(data_dir: str = "./data") -> ParquetDataSource:
    """Factory function for Parquet data source."""
    return ParquetDataSource(Path(data_dir))


def create_postgres_source(env_var: str = "DATABASE_URL") -> PostgreSQLDataSource:
    """Factory function for PostgreSQL data source.

    Reads connection string from environment variable.
    """
    return PostgreSQLDataSource.from_env(env_var)


# =============================================================================
# Exports
# =============================================================================

__all__ = [
    "DataSource",
    "CSVDataSource",
    "ParquetDataSource",
    "PostgreSQLDataSource",
    "create_csv_source",
    "create_parquet_source",
    "create_postgres_source",
]

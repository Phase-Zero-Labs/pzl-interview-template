"""
Notebook loader for Hamilton pipelines.

Extracts type-hinted functions from Jupyter notebooks and creates
synthetic Python modules that Hamilton can load.
"""

import ast
import sys
import types
from pathlib import Path

import nbformat


def is_hamilton_function(node: ast.FunctionDef) -> bool:
    """Check if a function definition has return type annotation.

    Hamilton requires functions to have return types for proper DAG construction.
    Private functions (starting with _) are excluded.
    """
    return node.returns is not None and not node.name.startswith("_")


def extract_functions_from_notebook(notebook_path: Path) -> dict[str, str]:
    """Extract Hamilton-compatible functions from a notebook.

    Returns:
        Dict mapping function_name -> source_code
    """
    with open(notebook_path, "r", encoding="utf-8") as f:
        nb = nbformat.read(f, as_version=4)

    functions = {}

    for cell in nb.cells:
        if cell.cell_type != "code":
            continue

        source = cell.source
        if not source.strip():
            continue

        try:
            tree = ast.parse(source)
        except SyntaxError:
            continue

        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef) and is_hamilton_function(node):
                # Extract the function source using line numbers
                lines = source.split("\n")
                # Get the function's line range
                start_line = node.lineno - 1
                end_line = node.end_lineno if node.end_lineno else len(lines)
                func_source = "\n".join(lines[start_line:end_line])

                if func_source:
                    functions[node.name] = func_source

    return functions


def extract_imports_from_notebook(notebook_path: Path) -> list[str]:
    """Extract import statements from notebook cells."""
    with open(notebook_path, "r", encoding="utf-8") as f:
        nb = nbformat.read(f, as_version=4)

    imports = []
    seen = set()

    for cell in nb.cells:
        if cell.cell_type != "code":
            continue

        source = cell.source
        if not source.strip():
            continue

        try:
            tree = ast.parse(source)
        except SyntaxError:
            continue

        for node in ast.iter_child_nodes(tree):
            if isinstance(node, (ast.Import, ast.ImportFrom)):
                import_str = ast.unparse(node)
                if import_str not in seen:
                    seen.add(import_str)
                    imports.append(import_str)

    return imports


def create_synthetic_module(
    notebook_path: Path,
    module_name: str,
) -> types.ModuleType | None:
    """Create a Python module from notebook functions.

    This allows Hamilton to treat notebook functions identically to .py file functions.

    Args:
        notebook_path: Path to the .ipynb file
        module_name: Module name (e.g., "scripts.my_notebook")

    Returns:
        Module object with extracted functions, or None if no functions found
    """
    functions = extract_functions_from_notebook(notebook_path)

    if not functions:
        return None

    # Collect all imports from notebook
    imports = extract_imports_from_notebook(notebook_path)

    # Create module source
    module_source_parts = [
        f'"""Synthetic module generated from {notebook_path.name}"""',
        "",
        "# Imports extracted from notebook",
        *imports,
        "",
        "# Functions extracted from notebook",
    ]

    for func_name, func_source in functions.items():
        module_source_parts.append(func_source)
        module_source_parts.append("")

    module_source = "\n".join(module_source_parts)

    # Create and execute module
    module = types.ModuleType(module_name)
    module.__file__ = str(notebook_path)
    module.__notebook__ = True  # Mark as notebook-sourced
    module.__notebook_path__ = str(notebook_path)

    try:
        exec(compile(module_source, str(notebook_path), "exec"), module.__dict__)
    except Exception as e:
        print(f"Warning: Error compiling notebook {notebook_path.name}: {e}")
        return None

    # Register in sys.modules for import resolution
    sys.modules[module_name] = module

    return module

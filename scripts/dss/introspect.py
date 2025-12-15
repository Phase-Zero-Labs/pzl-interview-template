#!/usr/bin/env python3
"""
PZL-DSS Hamilton DAG introspection script.

Outputs JSON graph data for the UI server.
Called by the Bun server to get graph structure.

Usage:
    python scripts/dss/introspect.py [--title "Title"] [--project "name"] [--env "production"]
"""

import json
import importlib
import re
import sys
from pathlib import Path


def introspect_hamilton_graph(title="PZL-DSS Pipeline", project="pzl-dss-template", env="production"):
    """Introspect Hamilton modules and return graph structure."""
    from hamilton import driver

    # Auto-discover .py files in scripts/
    scripts_dir = Path('scripts')
    modules = []

    for py_file in scripts_dir.glob('*.py'):
        if py_file.name in ('__init__.py', 'run.py', 'config.py'):
            continue
        module_name = f'scripts.{py_file.stem}'
        try:
            modules.append(importlib.import_module(module_name))
        except ImportError as e:
            print(f'Warning: Could not import {module_name}: {e}', file=sys.stderr)

    # Auto-discover .ipynb notebooks with Hamilton functions
    try:
        from scripts.utils.notebook_loader import create_synthetic_module
        for nb_file in scripts_dir.glob('*.ipynb'):
            if '.ipynb_checkpoints' in str(nb_file):
                continue
            module_name = f'scripts.{nb_file.stem}'
            try:
                module = create_synthetic_module(nb_file, module_name)
                if module:
                    modules.append(module)
            except Exception as e:
                print(f'Warning: Could not load notebook {nb_file.name}: {e}', file=sys.stderr)
    except ImportError:
        pass  # nbformat not installed

    if not modules:
        return {'nodes': [], 'links': [], 'modules': {}, 'maxDepth': 0}

    dr = driver.Builder().with_modules(*modules).build()

    # Auto-detect modules and assign colors
    module_colors = ['#0066CC', '#FF9900', '#FF3366', '#4CAF50', '#9333ea', '#06b6d4', '#f43f5e']
    detected_modules = {}
    color_idx = 0

    nodes = []
    links = []

    for name, node in dr.graph.nodes.items():
        module = 'unknown'
        full_module = ''
        source = 'production'
        is_notebook = False
        notebook_path = None

        if hasattr(node.callable, '__module__'):
            full_module = node.callable.__module__
            module = full_module.split('.')[-1]

            if full_module.startswith('Sandbox'):
                source = 'sandbox'
            elif full_module.startswith('scripts'):
                source = 'production'

            mod = sys.modules.get(full_module)
            if mod and getattr(mod, '__notebook__', False):
                is_notebook = True
                notebook_path = getattr(mod, '__notebook_path__', None)

        # Auto-assign colors to new modules
        if module not in detected_modules:
            detected_modules[module] = {
                'color': module_colors[color_idx % len(module_colors)],
                'order': color_idx
            }
            color_idx += 1

        deps = list(node.input_types.keys())

        # Extract tags from docstring
        tags = []
        doc = node.documentation or ''
        doc_lower = doc.lower()

        # @ignore - skip this node in UI
        if re.search(r'@ignore\b', doc, re.IGNORECASE):
            continue

        # @asset - mark as data catalog entry
        if re.search(r'@asset(?::\s*([^\n]+))?', doc, re.IGNORECASE):
            tags.append({'label': 'Asset', 'color': '#f59e0b'})

        # @location - hint where data is saved
        if re.search(r'@location:\s*([^\n]+)', doc, re.IGNORECASE):
            tags.append({'label': 'Location', 'color': '#06b6d4'})

        # @viz_output - visualization output
        if re.search(r'@viz_output:\s*([^\n]+)', doc, re.IGNORECASE):
            tags.append({'label': 'Viz', 'color': '#ec4899'})

        # @no_cache - don't auto-cache this DataFrame
        if re.search(r'@no_cache\b', doc, re.IGNORECASE):
            tags.append({'label': 'No Cache', 'color': '#6b7280'})

        # @sync - sync data files to central DSS
        if re.search(r'@sync\b', doc, re.IGNORECASE):
            tags.append({'label': 'Sync', 'color': '#22c55e'})

        # @local - keep metadata local only (don't sync)
        if re.search(r'@local\b', doc, re.IGNORECASE):
            tags.append({'label': 'Local', 'color': '#f97316'})

        # Keyword-based auto-tags
        if 'postgresql' in doc_lower or 'database' in doc_lower or ('import' in doc_lower and 'from' in doc_lower):
            tags.append({'label': 'DB', 'color': '#3b82f6'})
        if 'download' in doc_lower or 'fetch' in doc_lower or 'http' in doc_lower:
            tags.append({'label': 'External', 'color': '#8b5cf6'})
        if 'parquet' in doc_lower or 'save' in doc_lower:
            tags.append({'label': 'Parquet', 'color': '#22c55e'})
        if not any(t['label'] == 'Viz' for t in tags):
            if 'figure' in doc_lower or 'plot' in doc_lower or 'visual' in doc_lower:
                tags.append({'label': 'Viz', 'color': '#ec4899'})

        # Custom tags: @tag: label or @tag: label #hexcolor
        custom_tags = re.findall(r'@tag:\s*(\S+)(?:\s+(#[0-9a-fA-F]{6}))?', doc)
        for label, color in custom_tags:
            tags.append({
                'label': label,
                'color': color if color else '#6b7280'
            })

        # Simplify return type
        return_type = str(node.type) if node.type else 'Any'
        if 'DataFrame' in return_type:
            return_type = 'DataFrame'
        elif 'Database' in return_type or 'DataSource' in return_type:
            return_type = 'Connection'
        elif 'Dict' in return_type or 'dict' in return_type:
            return_type = 'Dict'
        elif 'str' in return_type:
            return_type = 'String'
        elif 'Path' in return_type:
            return_type = 'Path'

        nodes.append({
            'id': name,
            'module': module,
            'full_module': full_module,
            'source': source,
            'is_notebook': is_notebook,
            'notebook_path': notebook_path,
            'module_info': detected_modules.get(module, {'color': '#666', 'order': 99}),
            'return_type': return_type,
            'doc': doc[:300] if doc else '',
            'dependencies': deps,
            'tags': tags,
            'dep_count': len(deps),
        })

        for dep in deps:
            links.append({'source': dep, 'target': name})

    # Calculate depth (topological layer) for each node
    depths = {}

    def get_depth(node_id, visited=None):
        if visited is None:
            visited = set()
        if node_id in visited:
            return 0
        visited.add(node_id)
        if node_id in depths:
            return depths[node_id]
        node_data = next((n for n in nodes if n['id'] == node_id), None)
        if not node_data or not node_data['dependencies']:
            depths[node_id] = 0
            return 0
        max_dep = max(get_depth(d, visited.copy()) for d in node_data['dependencies'])
        depths[node_id] = max_dep + 1
        return depths[node_id]

    for node_data in nodes:
        node_data['depth'] = get_depth(node_data['id'])

    max_depth = max(n['depth'] for n in nodes) if nodes else 0
    module_order = sorted(detected_modules.keys(), key=lambda m: detected_modules[m]['order'])

    return {
        'nodes': nodes,
        'links': links,
        'modules': detected_modules,
        'module_order': module_order,
        'max_depth': max_depth,
        'title': title,
        'project': project,
        'environment': env,
    }


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Introspect Hamilton DAG')
    parser.add_argument('--title', default='PZL-DSS Pipeline', help='Pipeline title')
    parser.add_argument('--project', default='pzl-dss-template', help='Project name')
    parser.add_argument('--env', default='production', help='Environment name')
    args = parser.parse_args()

    try:
        result = introspect_hamilton_graph(args.title, args.project, args.env)
        print(json.dumps(result))
    except Exception as e:
        import traceback
        print(json.dumps({
            'nodes': [],
            'links': [],
            'modules': {},
            'max_depth': 0,
            'error': str(e),
            'traceback': traceback.format_exc()
        }))
        sys.exit(1)

"""
Visualization utilities for ds-template project

This module re-exports the AGC (American Graphics Company) style utilities.
It provides a single import point for visualization utilities.

Usage:
------
from scripts.utils.visualization import setup_agc_style, AGC_COLORS, format_title

setup_agc_style()
plt.bar(x, y, color=AGC_COLORS['primary_blue'])
plt.title(format_title('DATA ANALYSIS', 'By Category'))
"""

# Re-export everything from agc_style
from scripts.utils.agc_style import (
    AGC_COLORS,
    IBM_PALETTE,
    add_value_labels,
    create_legend,
    format_title,
    get_color_palette,
    setup_agc_style,
    style_axis,
)

__all__ = [
    'AGC_COLORS',
    'IBM_PALETTE',
    'setup_agc_style',
    'format_title',
    'style_axis',
    'get_color_palette',
    'create_legend',
    'add_value_labels'
]

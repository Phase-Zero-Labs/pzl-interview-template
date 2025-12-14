#!/usr/bin/env python3
"""
AGC (American Graphics Company) style configuration for all visualizations
JetBrains Mono font, IBM-esque bold colors, sharp corners, clean layouts
"""


import matplotlib.pyplot as plt

# AGC Color Palette - Bold, high-contrast colors
AGC_COLORS = {
    'primary_blue': '#0066CC',
    'hot_pink': '#FF3366',
    'bold_orange': '#FF9900',
    'neutral_gray': '#666666',
    'black': '#000000',
    'white': '#FFFFFF',
    'background': '#FAFAFA',
    'grid': '#E0E0E0',
    'axes': '#333333',

    # Additional colors for complex plots
    'purple': '#9933CC',
    'green': '#00AA44',
    'yellow': '#FFCC00',
    'cyan': '#00CCCC',
    'dark_red': '#CC0033',
    'dark_blue': '#003366',
}

# IBM-inspired categorical colors
IBM_PALETTE = [
    '#0066CC',  # Blue
    '#FF3366',  # Pink/Red
    '#00AA44',  # Green
    '#FF9900',  # Orange
    '#9933CC',  # Purple
    '#00CCCC',  # Cyan
    '#FFCC00',  # Yellow
    '#666666',  # Gray
]

def setup_agc_style():
    """
    Configure matplotlib for AGC/IBM aesthetic with JetBrains Mono font
    Sharp corners, bold lines, no rounded edges
    """
    # Font configuration - JetBrains Mono with fallbacks
    plt.rcParams['font.family'] = 'monospace'
    plt.rcParams['font.monospace'] = [
        'JetBrains Mono',
        'Berkeley Mono',
        'SF Mono',
        'Menlo',
        'Monaco',
        'Consolas',
        'DejaVu Sans Mono',
        'Courier New'
    ]
    plt.rcParams['font.size'] = 10
    plt.rcParams['font.weight'] = 'normal'

    # Axes configuration - Sharp, bold lines
    plt.rcParams['axes.linewidth'] = 2.0
    plt.rcParams['axes.edgecolor'] = AGC_COLORS['black']
    plt.rcParams['axes.labelcolor'] = AGC_COLORS['black']
    plt.rcParams['axes.titleweight'] = 'bold'
    plt.rcParams['axes.titlesize'] = 12
    plt.rcParams['axes.labelweight'] = 'bold'
    plt.rcParams['axes.labelsize'] = 10
    plt.rcParams['axes.grid'] = False  # We'll control grid manually
    plt.rcParams['axes.spines.top'] = True
    plt.rcParams['axes.spines.right'] = True
    plt.rcParams['axes.spines.bottom'] = True
    plt.rcParams['axes.spines.left'] = True

    # Tick configuration
    plt.rcParams['xtick.color'] = AGC_COLORS['black']
    plt.rcParams['ytick.color'] = AGC_COLORS['black']
    plt.rcParams['xtick.major.width'] = 1.5
    plt.rcParams['ytick.major.width'] = 1.5
    plt.rcParams['xtick.major.size'] = 5
    plt.rcParams['ytick.major.size'] = 5
    plt.rcParams['xtick.labelsize'] = 9
    plt.rcParams['ytick.labelsize'] = 9

    # Text configuration
    plt.rcParams['text.color'] = AGC_COLORS['black']

    # Figure configuration
    plt.rcParams['figure.facecolor'] = AGC_COLORS['background']
    plt.rcParams['axes.facecolor'] = AGC_COLORS['white']

    # Grid configuration (when used)
    plt.rcParams['grid.color'] = AGC_COLORS['grid']
    plt.rcParams['grid.linestyle'] = '--'
    plt.rcParams['grid.linewidth'] = 0.75
    plt.rcParams['grid.alpha'] = 0.5

    # Legend configuration - Sharp corners
    plt.rcParams['legend.frameon'] = True
    plt.rcParams['legend.framealpha'] = 1.0
    plt.rcParams['legend.facecolor'] = AGC_COLORS['white']
    plt.rcParams['legend.edgecolor'] = AGC_COLORS['black']
    plt.rcParams['legend.borderpad'] = 0.5
    plt.rcParams['legend.columnspacing'] = 1.0
    plt.rcParams['legend.fontsize'] = 9
    plt.rcParams['legend.title_fontsize'] = 10

    # Savefig configuration
    plt.rcParams['savefig.edgecolor'] = 'none'
    plt.rcParams['savefig.facecolor'] = AGC_COLORS['background']
    plt.rcParams['savefig.bbox'] = 'tight'
    plt.rcParams['savefig.pad_inches'] = 0.2

    # Turn off rounded corners for bar plots
    plt.rcParams['patch.linewidth'] = 1.5
    plt.rcParams['patch.edgecolor'] = AGC_COLORS['black']

    # Scatter plot configuration
    plt.rcParams['scatter.edgecolors'] = AGC_COLORS['black']

    # Line plot configuration
    plt.rcParams['lines.linewidth'] = 2.0
    plt.rcParams['lines.solid_capstyle'] = 'butt'
    plt.rcParams['lines.solid_joinstyle'] = 'miter'

    # Error bar configuration
    plt.rcParams['errorbar.capsize'] = 5

    # Heatmap configuration
    plt.rcParams['image.cmap'] = 'RdBu_r'


def format_title(main_title: str, subtitle: str | None = None) -> str:
    """
    Format title in AGC/IBM style with brackets

    Parameters:
    -----------
    main_title : str
        Main title text
    subtitle : str, optional
        Subtitle text

    Returns:
    --------
    str
        Formatted title
    """
    if subtitle:
        return f"[{main_title}] {subtitle}"
    return f"[{main_title}]"


def add_clean_grid(ax, axis='both', behind=True):
    """
    Add clean grid with proper layering

    Parameters:
    -----------
    ax : matplotlib.axes
        Axes to add grid to
    axis : str
        Which axis to show grid ('x', 'y', or 'both')
    behind : bool
        Whether to put grid behind data
    """
    ax.grid(True, axis=axis, linestyle='--', linewidth=0.75,
            color=AGC_COLORS['grid'], alpha=0.5)
    if behind:
        ax.set_axisbelow(True)


def style_axis(ax, bold_frame=True, grid=True, grid_axis='y'):
    """
    Apply consistent AGC styling to axis

    Parameters:
    -----------
    ax : matplotlib.axes
        Axes to style
    bold_frame : bool
        Whether to use bold frame
    grid : bool
        Whether to show grid
    grid_axis : str
        Which axis for grid ('x', 'y', 'both')
    """
    # Frame styling - sharp corners, bold lines
    for spine in ax.spines.values():
        spine.set_linewidth(2.0 if bold_frame else 1.5)
        spine.set_color(AGC_COLORS['black'])
        spine.set_capstyle('butt')
        spine.set_joinstyle('miter')

    # Tick styling
    ax.tick_params(axis='both', which='major', labelsize=9,
                   width=1.5, length=5, color=AGC_COLORS['black'],
                   pad=5)

    # Grid
    if grid:
        add_clean_grid(ax, axis=grid_axis, behind=True)

    # Label styling
    ax.xaxis.label.set_weight('bold')
    ax.yaxis.label.set_weight('bold')
    ax.xaxis.label.set_size(10)
    ax.yaxis.label.set_size(10)

    # Title styling
    if ax.get_title():
        ax.title.set_weight('bold')
        ax.title.set_size(11)


def get_color_palette(n_colors: int | None = None) -> list:
    """
    Get AGC/IBM color palette

    Parameters:
    -----------
    n_colors : int
        Number of colors needed

    Returns:
    --------
    list
        List of color hex codes
    """
    if n_colors is None:
        return IBM_PALETTE

    if n_colors <= len(IBM_PALETTE):
        return IBM_PALETTE[:n_colors]
    else:
        # Repeat palette if more colors needed
        palette = []
        for i in range(n_colors):
            palette.append(IBM_PALETTE[i % len(IBM_PALETTE)])
        return palette


def create_legend(ax, loc='best', ncol=1, title=None):
    """
    Create styled legend with sharp corners

    Parameters:
    -----------
    ax : matplotlib.axes
        Axes to add legend to
    loc : str or tuple
        Legend location
    ncol : int
        Number of columns
    title : str
        Legend title
    """
    legend = ax.legend(
        loc=loc,
        ncol=ncol,
        title=title,
        frameon=True,
        fancybox=False,  # No rounded corners
        framealpha=1.0,
        facecolor=AGC_COLORS['white'],
        edgecolor=AGC_COLORS['black'],
        borderpad=0.5,
        columnspacing=1.0,
        prop={'size': 9, 'family': 'monospace', 'weight': 'normal'},
        title_fontproperties={'size': 10, 'weight': 'bold', 'family': 'monospace'}
    )
    legend.get_frame().set_linewidth(1.5)
    return legend


def prevent_text_overlap(ax, rotation=45, ha='right'):
    """
    Prevent text overlap on x-axis labels

    Parameters:
    -----------
    ax : matplotlib.axes
        Axes to adjust
    rotation : int
        Rotation angle for labels
    ha : str
        Horizontal alignment
    """
    ax.set_xticklabels(ax.get_xticklabels(), rotation=rotation, ha=ha)
    # Add padding to prevent cutoff
    ax.tick_params(axis='x', pad=8)


def add_value_labels(ax, bars, format_str='{:.1f}', offset=0.05):
    """
    Add value labels on top of bars

    Parameters:
    -----------
    ax : matplotlib.axes
        Axes with bars
    bars : bar container
        Bars to label
    format_str : str
        Format string for values
    offset : float
        Vertical offset for labels
    """
    for bar in bars:
        height = bar.get_height()
        if height != 0:  # Only label non-zero bars
            ax.annotate(format_str.format(height),
                       xy=(bar.get_x() + bar.get_width() / 2, height),
                       xytext=(0, 3 if height > 0 else -15),  # Offset
                       textcoords="offset points",
                       ha='center', va='bottom' if height > 0 else 'top',
                       fontsize=8, fontweight='bold',
                       fontfamily='monospace')


# Export all styling functions and constants
__all__ = [
    'setup_agc_style',
    'AGC_COLORS',
    'IBM_PALETTE',
    'format_title',
    'add_clean_grid',
    'style_axis',
    'get_color_palette',
    'create_legend',
    'prevent_text_overlap',
    'add_value_labels'
]

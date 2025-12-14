#!/usr/bin/env python3
"""
Archive current Sandbox work to a named batch.

Moves all content from scripts/ and results/ to archive/{batch-name}/,
keeping scripts and results paired together.

Usage:
    python Sandbox/archive_cleanup.py <batch-name>
    python Sandbox/archive_cleanup.py <batch-name> --dry-run

Examples:
    python Sandbox/archive_cleanup.py pre-ml-refactor
    python Sandbox/archive_cleanup.py december-2024 --dry-run
"""

import argparse
import shutil
from pathlib import Path


SANDBOX_ROOT = Path(__file__).parent
ARCHIVE_DIR = SANDBOX_ROOT / "archive"

# Directories to archive (contents will be moved)
DIRS_TO_ARCHIVE = ["scripts", "results"]

# Items to skip (never archive these)
SKIP_ITEMS = {"__pycache__", ".DS_Store", ".gitkeep"}


def get_items_to_move(source_dir: Path) -> list[Path]:
    """Get list of items to move from a directory."""
    if not source_dir.exists():
        return []

    items = []
    for item in source_dir.iterdir():
        if item.name not in SKIP_ITEMS:
            items.append(item)
    return items


def archive_sandbox(batch_name: str, dry_run: bool = False) -> dict:
    """
    Archive current Sandbox content to a named batch.

    Args:
        batch_name: Name for the archive batch (e.g., "pre-ml-refactor")
        dry_run: If True, only print what would be done

    Returns:
        Summary dict with counts of items moved
    """
    batch_dir = ARCHIVE_DIR / batch_name

    if batch_dir.exists():
        raise ValueError(f"Archive batch '{batch_name}' already exists at {batch_dir}")

    summary = {"scripts": [], "results": []}

    for dir_name in DIRS_TO_ARCHIVE:
        source_dir = SANDBOX_ROOT / dir_name
        target_dir = batch_dir / dir_name

        items = get_items_to_move(source_dir)

        if not items:
            print(f"  {dir_name}/: (empty, nothing to archive)")
            continue

        summary[dir_name] = [item.name for item in items]

        if dry_run:
            print(f"  {dir_name}/: would move {len(items)} items to archive/{batch_name}/{dir_name}/")
            for item in items:
                print(f"    - {item.name}")
        else:
            # Create target directory
            target_dir.mkdir(parents=True, exist_ok=True)

            # Move each item
            for item in items:
                dest = target_dir / item.name
                shutil.move(str(item), str(dest))

            print(f"  {dir_name}/: moved {len(items)} items to archive/{batch_name}/{dir_name}/")

    return summary


def main():
    parser = argparse.ArgumentParser(
        description="Archive current Sandbox work to a named batch",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python Sandbox/archive_cleanup.py pre-ml-refactor
  python Sandbox/archive_cleanup.py december-2024 --dry-run

This will move all content from:
  Sandbox/scripts/*  ->  Sandbox/archive/{batch-name}/scripts/
  Sandbox/results/*  ->  Sandbox/archive/{batch-name}/results/

The utils/, data/, and docs/ directories are NOT archived.
        """
    )
    parser.add_argument(
        "batch_name",
        help="Name for this archive batch (e.g., 'pre-ml-refactor', 'december-2024')"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be moved without actually moving"
    )

    args = parser.parse_args()

    # Validate batch name (no special characters)
    if not args.batch_name.replace("-", "").replace("_", "").isalnum():
        parser.error("Batch name should only contain letters, numbers, hyphens, and underscores")

    print(f"\n{'[DRY RUN] ' if args.dry_run else ''}Archiving Sandbox to: archive/{args.batch_name}/\n")

    try:
        summary = archive_sandbox(args.batch_name, dry_run=args.dry_run)

        total_items = sum(len(items) for items in summary.values())

        if args.dry_run:
            print(f"\n[DRY RUN] Would archive {total_items} items total")
            print("Run without --dry-run to actually move files")
        else:
            print(f"\nArchived {total_items} items to archive/{args.batch_name}/")
            print("Sandbox scripts/ and results/ are now empty and ready for new work!")

    except ValueError as e:
        print(f"\nError: {e}")
        return 1

    return 0


if __name__ == "__main__":
    exit(main())

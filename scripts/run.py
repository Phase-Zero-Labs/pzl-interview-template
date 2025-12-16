#!/usr/bin/env python
"""
Hamilton pipeline driver.

Usage:
    # Run specific outputs
    python scripts/run.py --outputs my_node another_node

    # Show DAG visualization
    python scripts/run.py --visualize

    # With Hamilton UI tracking
    python scripts/run.py --outputs my_node --track

    # List all available outputs
    python scripts/run.py --list

    # Run directly without server (no history tracking)
    python scripts/run.py --outputs my_node --direct
"""

import argparse
import importlib
import json
import subprocess
import sys
import time
from pathlib import Path

import requests
import sseclient
from hamilton import driver

# Server configuration
SERVER_PORT = 5050
SERVER_URL = f"http://localhost:{SERVER_PORT}"
PROJECT_ROOT = Path(__file__).parent.parent


# =============================================================================
# Module Discovery
# =============================================================================


def discover_modules():
    """Discover Hamilton modules in scripts/ directory.

    Returns list of module objects. Any .py file in scripts/ that isn't
    __init__.py or run.py is considered a potential Hamilton module.
    Also discovers .ipynb notebooks with type-hinted functions.
    """
    scripts_dir = PROJECT_ROOT / "scripts"
    modules = []

    # Look for .py files in scripts/ (not in subdirectories)
    for py_file in scripts_dir.glob("*.py"):
        if py_file.name in ("__init__.py", "run.py", "config.py"):
            continue

        module_name = f"scripts.{py_file.stem}"
        try:
            module = importlib.import_module(module_name)
            modules.append(module)
        except ImportError as e:
            print(f"Warning: Could not import {module_name}: {e}")

    # Discover .ipynb notebooks with Hamilton functions
    try:
        from scripts.utils.notebook_loader import create_synthetic_module

        for nb_file in scripts_dir.glob("*.ipynb"):
            # Skip checkpoint files
            if ".ipynb_checkpoints" in str(nb_file):
                continue

            module_name = f"scripts.{nb_file.stem}"
            try:
                module = create_synthetic_module(nb_file, module_name)
                if module:
                    modules.append(module)
                    print(f"Loaded notebook: {nb_file.name}")
            except Exception as e:
                print(f"Warning: Could not load notebook {nb_file.name}: {e}")
    except ImportError:
        # nbformat not installed, skip notebook discovery
        pass

    return modules


def get_module_functions(module):
    """Get callable functions from a module (excluding private ones)."""
    return [
        name
        for name in dir(module)
        if not name.startswith("_") and callable(getattr(module, name))
    ]


# =============================================================================
# Server Management
# =============================================================================


def is_server_running() -> bool:
    """Check if the UI server is running by hitting the health endpoint."""
    try:
        response = requests.get(f"{SERVER_URL}/health", timeout=1)
        return response.status_code == 200
    except requests.RequestException:
        return False


def start_server_background() -> subprocess.Popen:
    """Start the Bun server in background."""
    server_path = PROJECT_ROOT / "scripts" / "dss" / "start.ts"

    proc = subprocess.Popen(
        ["bun", "run", str(server_path), "--no-open"],
        cwd=str(PROJECT_ROOT),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,  # Detach from parent process
    )
    return proc


def wait_for_server(timeout: float = 10.0) -> bool:
    """Wait for server to become ready."""
    start = time.time()
    while time.time() - start < timeout:
        if is_server_running():
            return True
        time.sleep(0.1)
    return False


def ensure_server_running() -> bool:
    """Ensure server is running, starting it if necessary.

    Returns True if server is available, False otherwise.
    """
    if is_server_running():
        return True

    print("Starting Hamilton UI server...")
    start_server_background()

    if wait_for_server():
        print(f"Server started on port {SERVER_PORT}")
        return True
    else:
        print("Warning: Failed to start server")
        return False


# =============================================================================
# API Execution
# =============================================================================


def poll_job_status(job_id: str, timeout: float = 600) -> tuple[str, int | None, str | None]:
    """Poll job status until complete or timeout.

    Returns (status, exit_code, error_message) tuple.
    """
    start = time.time()
    while time.time() - start < timeout:
        try:
            response = requests.get(f"{SERVER_URL}/api/history/{job_id}", timeout=5)
            if response.ok:
                data = response.json()
                job = data.get("job")
                if job and job.get("status") in ("completed", "failed"):
                    return job["status"], job.get("exit_code"), job.get("error_message")
        except requests.RequestException:
            pass
        time.sleep(1)
    return "timeout", None, None


def run_via_api(outputs: list[str], node_id: str | None = None) -> int:
    """Run pipeline via server API with SSE streaming.

    Returns exit code (0 = success, non-zero = failure).
    """
    target_node = node_id or outputs[0]

    # Start the job
    try:
        response = requests.post(
            f"{SERVER_URL}/api/run",
            json={"outputs": outputs, "nodeId": target_node},
            timeout=5,
        )
    except requests.RequestException as e:
        print(f"Error connecting to server: {e}")
        return 1

    if not response.ok:
        print(f"Error starting job: {response.text}")
        return 1

    data = response.json()
    job_id = data["jobId"]
    print(f"Job started: {job_id}")
    print("-" * 40)

    # Stream logs via SSE
    exit_code = 0
    stream_completed = False
    try:
        response = requests.get(
            f"{SERVER_URL}/api/job/{job_id}/stream",
            stream=True,
            timeout=None,  # No timeout for streaming
        )
        client = sseclient.SSEClient(response)

        for event in client.events():
            if event.event == "ping":
                # Keep-alive ping from server, ignore
                continue
            elif event.event == "log":
                log_data = json.loads(event.data)
                line = log_data["line"]
                if log_data["stream"] == "stderr":
                    print(f"[stderr] {line}", file=sys.stderr)
                else:
                    print(line)
            elif event.event == "complete":
                complete_data = json.loads(event.data)
                exit_code = complete_data.get("exitCode", 0) or 0
                status = complete_data.get("status", "completed")
                duration_ms = complete_data.get("duration")

                print("-" * 40)
                print(f"Status: {status}")
                if duration_ms:
                    print(f"Duration: {duration_ms / 1000:.1f}s")
                stream_completed = True
                break

    except KeyboardInterrupt:
        print("\nInterrupted - job may still be running on server")
        return 130  # Standard SIGINT exit code
    except Exception as e:
        # Stream ended prematurely - fall back to polling
        print(f"[stream interrupted: {e}]")
        print("Polling for job completion...")

    # If stream didn't complete normally, poll for final status
    if not stream_completed:
        status, polled_exit_code, error_message = poll_job_status(job_id)
        print("-" * 40)
        print(f"Status: {status}")
        if error_message:
            print(f"Error: {error_message}")
        exit_code = polled_exit_code if polled_exit_code is not None else (0 if status == "completed" else 1)

    return exit_code


# =============================================================================
# Direct Execution (no server)
# =============================================================================


def build_driver(track: bool = False):
    """Build Hamilton driver with discovered modules."""
    modules = discover_modules()

    if not modules:
        print("No Hamilton modules found in scripts/")
        print("Add .py files with functions to scripts/ to build your pipeline.")
        return None

    builder = driver.Builder().with_modules(*modules)

    if track:
        try:
            from hamilton.plugins import h_tracker

            tracker = h_tracker.HamiltonTracker(
                project_id="ds-template",
                username="user",
                dag_name="pipeline",
            )
            builder = builder.with_adapters(tracker)
            print("Hamilton UI tracking enabled")
        except ImportError:
            print("Warning: Hamilton tracking not available. Install with: pip install sf-hamilton[ui,sdk]")

    return builder.build()


def ensure_directories():
    """Create output directories if they don't exist."""
    dirs = [
        "results",
        "data",
    ]
    for d in dirs:
        Path(d).mkdir(parents=True, exist_ok=True)


def list_outputs(dr):
    """List all available outputs from the pipeline."""
    modules = discover_modules()

    if not modules:
        print("\nNo Hamilton modules found in scripts/")
        print("Add .py files with functions to scripts/ to build your pipeline.")
        return

    print("\nAvailable outputs:")
    print("-" * 40)

    for module in modules:
        module_name = module.__name__.split(".")[-1]
        funcs = get_module_functions(module)
        if funcs:
            print(f"\n{module_name}:")
            for func in funcs:
                print(f"  - {func}")


def run_direct(outputs: list[str], track: bool = False) -> int:
    """Run pipeline directly without server (no history tracking)."""
    dr = build_driver(track=track)

    if dr is None:
        return 1

    # Ensure output directories exist
    ensure_directories()

    print("\nRunning Hamilton pipeline (direct mode)...")
    print(f"Outputs requested: {outputs}")
    print("-" * 40)

    try:
        results = dr.execute(final_vars=outputs)

        print("\n" + "=" * 40)
        print("PIPELINE COMPLETE")
        print("=" * 40)
        print(f"Computed outputs: {list(results.keys())}")

        # Show summary for DataFrames
        for name, result in results.items():
            if hasattr(result, "shape"):
                print(f"  {name}: {result.shape[0]:,} rows x {result.shape[1]} cols")
            elif isinstance(result, dict):
                print(f"  {name}: {result}")

        return 0

    except Exception as e:
        print(f"\nPipeline error: {e}")
        import traceback
        traceback.print_exc()
        return 1


def main():
    parser = argparse.ArgumentParser(
        description="Run Hamilton pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--outputs", nargs="+", help="Specific outputs to compute")
    parser.add_argument("--track", action="store_true", help="Enable Hamilton UI tracking")
    parser.add_argument("--visualize", action="store_true", help="Show DAG visualization")
    parser.add_argument("--list", action="store_true", help="List all available outputs")
    parser.add_argument(
        "--direct",
        action="store_true",
        help="Run directly without server (no history tracking)",
    )

    args = parser.parse_args()

    # Handle modes that don't require pipeline execution
    if args.visualize:
        dr = build_driver(track=args.track)
        if dr is None:
            return 1
        print("Displaying DAG visualization...")
        try:
            dr.display_all_functions()
        except Exception as e:
            print(f"Visualization error: {e}")
            print("Try: pip install sf-hamilton[visualization]")
        return 0

    if args.list:
        dr = build_driver(track=args.track)
        list_outputs(dr)
        return 0

    # Determine outputs to compute
    if args.outputs:
        outputs = args.outputs
    else:
        parser.print_help()
        print("\n" + "-" * 40)
        print("Tip: Add Hamilton modules to scripts/ and use --list to see available outputs")
        return 0

    # Execute pipeline
    if args.direct:
        # Direct execution (no server, no history tracking)
        return run_direct(outputs, track=args.track)

    # Default: try server-based execution for history tracking
    if ensure_server_running():
        print(f"\nRunning Hamilton pipeline via server...")
        print(f"Outputs requested: {outputs}")
        return run_via_api(outputs)
    else:
        # Fallback to direct execution
        print("Falling back to direct execution (no history tracking)")
        return run_direct(outputs, track=args.track)


if __name__ == "__main__":
    exit(main() or 0)

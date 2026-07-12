"""Command-line entry point: ``optimal-task-planner`` starts the web server."""

from __future__ import annotations

import argparse
import contextlib
import logging
import os
import sys
import threading
import time
import urllib.request
import webbrowser
from collections.abc import Mapping
from pathlib import Path

import uvicorn

from . import __version__
from .config import Settings


def _truthy(value: str | None) -> bool:
    return (value or "").strip().lower() not in ("", "0", "false", "no")


def _should_open_browser(no_browser: bool, reload_: bool, env: Mapping[str, str]) -> bool:
    """Open by default; suppressed by flag, env, or dev --reload respawns."""
    if no_browser or reload_:
        return False
    return not _truthy(env.get("OPTIMAL_TASK_PLANNER_NO_BROWSER"))


def _open_browser_when_ready(url: str, health_url: str, timeout_s: float = 15.0) -> None:
    """Poll the health endpoint, then open the UI — uvicorn.run() with a string
    factory offers no ready callback, so readiness is observed from outside."""
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        try:
            urllib.request.urlopen(health_url, timeout=1).close()
        except OSError:
            time.sleep(0.2)
            continue
        with contextlib.suppress(Exception):  # headless envs have no browser
            webbrowser.open(url)
        return


def main(argv: list[str] | None = None) -> None:
    defaults = Settings.from_env()
    parser = argparse.ArgumentParser(
        prog="optimal-task-planner",
        description="Optimal lab equipment scheduling — starts the Optimal Task Planner web UI.",
    )
    parser.add_argument("--host", default=defaults.host, help="bind address")
    parser.add_argument("--port", type=int, default=defaults.port, help="port")
    parser.add_argument(
        "--data-dir", default=str(defaults.data_dir), help="directory holding project.json"
    )
    parser.add_argument(
        "--days", type=int, default=defaults.days, help="planning horizon length in days"
    )
    parser.add_argument("--reload", action="store_true", help="auto-reload (development)")
    parser.add_argument(
        "--no-browser",
        action="store_true",
        help="do not open the web UI in a browser on startup",
    )
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    args = parser.parse_args(argv)

    # uvicorn's reloader re-execs sys.executable, which in a PyInstaller
    # bundle is the bundle itself — an endless respawn, not a dev server.
    if getattr(sys, "frozen", False) and args.reload:
        print("--reload is not supported in the standalone executable; ignoring it.")
        args.reload = False

    # Resolve to an absolute path before handing it around: the uvicorn factory
    # and --reload workers may run with a different CWD than this process.
    data_dir = Path(args.data_dir).expanduser().resolve()

    # Pass settings via env so uvicorn's factory (and --reload workers) pick them up.
    os.environ["OPTIMAL_TASK_PLANNER_HOST"] = args.host
    os.environ["OPTIMAL_TASK_PLANNER_PORT"] = str(args.port)
    os.environ["OPTIMAL_TASK_PLANNER_DATA_DIR"] = str(data_dir)
    os.environ["OPTIMAL_TASK_PLANNER_DAYS"] = str(args.days)

    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )

    # Loopback is always reachable even when bound to all interfaces; printing
    # (or opening) literal 0.0.0.0 would be misleading.
    display_host = "127.0.0.1" if args.host == "0.0.0.0" else args.host
    url = f"http://{display_host}:{args.port}"
    suffix = " (listening on all interfaces)" if args.host == "0.0.0.0" else ""
    print(f"Optimal Task Planner {__version__} — {url}{suffix}")
    print(f"Data directory: {data_dir}")
    if _should_open_browser(args.no_browser, args.reload, os.environ):
        threading.Thread(
            target=_open_browser_when_ready, args=(url, f"{url}/api/health"), daemon=True
        ).start()
    uvicorn.run(
        "optimal_task_planner.api:create_app",
        factory=True,
        host=args.host,
        port=args.port,
        reload=args.reload,
    )


if __name__ == "__main__":
    main()

"""Command-line entry point: ``optimal-task-planner`` starts the web server."""

from __future__ import annotations

import argparse
import logging
import os

import uvicorn

from . import __version__
from .config import Settings


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
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    args = parser.parse_args(argv)

    # Pass settings via env so uvicorn's factory (and --reload workers) pick them up.
    os.environ["OPTIMAL_TASK_PLANNER_HOST"] = args.host
    os.environ["OPTIMAL_TASK_PLANNER_PORT"] = str(args.port)
    os.environ["OPTIMAL_TASK_PLANNER_DATA_DIR"] = args.data_dir
    os.environ["OPTIMAL_TASK_PLANNER_DAYS"] = str(args.days)

    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )

    print(f"Optimal Task Planner {__version__} — http://{args.host}:{args.port}")
    uvicorn.run(
        "optimal_task_planner.api:create_app",
        factory=True,
        host=args.host,
        port=args.port,
        reload=args.reload,
    )


if __name__ == "__main__":
    main()

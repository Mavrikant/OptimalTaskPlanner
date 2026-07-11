"""Command-line entry point: ``labplanner`` starts the web server."""

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
        prog="labplanner",
        description="Optimal lab equipment scheduling — starts the LabPlanner web UI.",
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
    os.environ["LABPLANNER_HOST"] = args.host
    os.environ["LABPLANNER_PORT"] = str(args.port)
    os.environ["LABPLANNER_DATA_DIR"] = args.data_dir
    os.environ["LABPLANNER_DAYS"] = str(args.days)

    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )

    print(f"LabPlanner {__version__} — http://{args.host}:{args.port}")
    uvicorn.run(
        "labplanner.api:create_app",
        factory=True,
        host=args.host,
        port=args.port,
        reload=args.reload,
    )


if __name__ == "__main__":
    main()

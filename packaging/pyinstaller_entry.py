"""PyInstaller entry point: the frozen equivalent of `optimal-task-planner`.

PyInstaller needs a script file to analyze; the console-script shim that pip
generates for [project.scripts] doesn't exist in a frozen bundle.
"""

from optimal_task_planner.cli import main

if __name__ == "__main__":
    main()

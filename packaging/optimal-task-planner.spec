# PyInstaller spec for the standalone Windows executable.
# Build from the repo root:  pyinstaller packaging/optimal-task-planner.spec
from PyInstaller.utils.hooks import collect_all, collect_data_files

# ortools is a delvewheel-repaired package: its extension modules (.pyd) load
# DLLs from ortools/.libs at import time. The stock hook misses those on
# current ortools releases, so collect the whole package explicitly —
# binaries, data files and submodules.
ortools_datas, ortools_binaries, ortools_hidden = collect_all("ortools")

a = Analysis(
    ["pyinstaller_entry.py"],
    binaries=ortools_binaries,
    # static/ tree (index.html, JS, fonts, locales) — served from inside the
    # package via Path(__file__).parent, which works identically when frozen.
    datas=collect_data_files("optimal_task_planner") + ortools_datas,
    # uvicorn imports the app factory from a string at runtime.
    hiddenimports=["optimal_task_planner.api"] + ortools_hidden,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    name="optimal-task-planner",
    console=True,  # keep server logs visible; the UI opens in the browser
)

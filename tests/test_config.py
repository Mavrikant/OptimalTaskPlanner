"""Settings/default_data_dir resolution: flag > env > legacy ./data > platform dir."""

from pathlib import Path

import platformdirs

from optimal_task_planner.config import Settings, default_data_dir


def test_default_data_dir_prefers_existing_legacy_dir(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    (tmp_path / "data").mkdir()
    assert default_data_dir() == Path("data")


def test_default_data_dir_falls_back_to_platform_dir(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)  # no ./data here
    expected = Path(platformdirs.user_data_dir("optimal-task-planner", appauthor=False))
    assert default_data_dir() == expected


def test_from_env_env_var_wins_over_defaults(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    (tmp_path / "data").mkdir()  # would win as the legacy default...
    monkeypatch.setenv("OPTIMAL_TASK_PLANNER_DATA_DIR", str(tmp_path / "elsewhere"))
    assert Settings.from_env().data_dir == tmp_path / "elsewhere"


def test_from_env_uses_smart_default_when_env_unset(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("OPTIMAL_TASK_PLANNER_DATA_DIR", raising=False)
    assert Settings.from_env().data_dir == default_data_dir()


def test_settings_construction_keeps_explicit_data_dir(tmp_path):
    # conftest and callers construct Settings(data_dir=...) directly; the smart
    # default must never override an explicit value.
    assert Settings(data_dir=tmp_path / "x").data_dir == tmp_path / "x"

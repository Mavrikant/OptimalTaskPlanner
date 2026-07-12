"""Browser auto-open decision logic (the poll-and-open thread stays untested)."""

from optimal_task_planner.cli import _should_open_browser, _truthy


def test_truthy_variants():
    assert _truthy("1")
    assert _truthy("true")
    assert _truthy("YES")
    assert not _truthy(None)
    assert not _truthy("")
    assert not _truthy("0")
    assert not _truthy("false")
    assert not _truthy("No")
    assert not _truthy("  ")


def test_opens_by_default():
    assert _should_open_browser(no_browser=False, reload_=False, env={})


def test_flag_suppresses():
    assert not _should_open_browser(no_browser=True, reload_=False, env={})


def test_reload_suppresses():
    assert not _should_open_browser(no_browser=False, reload_=True, env={})


def test_env_suppresses():
    env = {"OPTIMAL_TASK_PLANNER_NO_BROWSER": "1"}
    assert not _should_open_browser(no_browser=False, reload_=False, env=env)


def test_falsy_env_does_not_suppress():
    env = {"OPTIMAL_TASK_PLANNER_NO_BROWSER": "0"}
    assert _should_open_browser(no_browser=False, reload_=False, env=env)

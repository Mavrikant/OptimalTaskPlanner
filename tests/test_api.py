from labplanner import __version__


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "version": __version__}


def test_index_serves_frontend(client):
    r = client.get("/")
    assert r.status_code == 200
    assert "LabPlanner" in r.text


def test_get_project_returns_default_and_horizon(client):
    d = client.get("/api/project").json()
    assert d["project"]["equipment"]
    assert d["horizon"]["days"] == 14
    assert d["horizon"]["slots_per_day"] == 48
    assert len(d["horizon"]["day_dates"]) == 14
    assert d["horizon"]["work_start_slot"] == 16
    assert d["horizon"]["work_end_slot"] == 36


def test_put_project_roundtrip(client):
    d = client.get("/api/project").json()
    project = d["project"]
    project["calendar"]["work_start"] = "09:30"
    project["calendar"]["holidays"] = ["2026-12-25"]

    r = client.put("/api/project", json=project)
    assert r.status_code == 200
    assert r.json()["horizon"]["work_start_slot"] == 19

    d2 = client.get("/api/project").json()
    assert d2["project"]["calendar"]["work_start"] == "09:30"
    assert d2["project"]["calendar"]["holidays"] == ["2026-12-25"]


def test_put_rejects_invalid_project(client):
    d = client.get("/api/project").json()
    project = d["project"]
    project["tasks"][0]["minutes"] = 45  # not slot-aligned
    r = client.put("/api/project", json=project)
    assert r.status_code == 422


def test_solve_returns_and_persists_schedule(client):
    r = client.post("/api/solve")
    assert r.status_code == 200
    schedule = r.json()["schedule"]
    assert schedule["status"] in ("OPTIMAL", "FEASIBLE")
    assert schedule["tasks"]

    d = client.get("/api/project").json()
    assert d["project"]["schedule"]["status"] == schedule["status"]


def test_holiday_countries(client):
    d = client.get("/api/holidays/countries").json()
    codes = {c["code"] for c in d["countries"]}
    assert "TR" in codes
    assert "US" in codes


def test_holidays_for_turkey(client):
    d = client.get("/api/holidays", params={"country": "TR", "year": 2026}).json()
    dates = {h["date"] for h in d["holidays"]}
    assert "2026-01-01" in dates
    assert "2026-10-29" in dates  # Republic Day


def test_holidays_unknown_country(client):
    r = client.get("/api/holidays", params={"country": "XX", "year": 2026})
    assert r.status_code == 400

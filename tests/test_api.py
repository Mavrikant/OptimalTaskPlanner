from labplanner import __version__


def default_pid(client):
    return client.get("/api/projects").json()["projects"][0]["id"]


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "version": __version__}


def test_index_serves_frontend(client):
    r = client.get("/")
    assert r.status_code == 200
    assert "LabPlanner" in r.text


def test_default_project_is_seeded(client):
    projects = client.get("/api/projects").json()["projects"]
    assert len(projects) == 1
    d = client.get(f"/api/projects/{projects[0]['id']}").json()
    assert d["project"]["equipment"]
    assert d["horizon"]["days"] == 14
    assert d["horizon"]["slots_per_day"] == 48
    assert len(d["horizon"]["day_dates"]) == 14


def test_project_crud_flow(client):
    r = client.post("/api/projects", json={"name": "Bench B"})
    assert r.status_code == 200
    pid = r.json()["id"]

    assert client.patch(f"/api/projects/{pid}", json={"name": "Bench B2"}).status_code == 200
    names = {p["id"]: p["name"] for p in client.get("/api/projects").json()["projects"]}
    assert names[pid] == "Bench B2"

    dup = client.post(f"/api/projects/{pid}/duplicate").json()
    assert dup["name"] == "Bench B2 (copy)"

    assert client.delete(f"/api/projects/{pid}").status_code == 200
    assert client.get(f"/api/projects/{pid}").status_code == 404


def test_unknown_project_is_404(client):
    assert client.get("/api/projects/nope").status_code == 404
    assert client.put("/api/projects/nope", json={"name": "x"}).status_code == 404
    assert client.post("/api/projects/nope/solve").status_code == 404
    assert client.delete("/api/projects/nope").status_code == 404


def test_put_project_roundtrip(client):
    pid = default_pid(client)
    project = client.get(f"/api/projects/{pid}").json()["project"]
    project["calendar"]["work_start"] = "09:30"
    project["calendar"]["holidays"] = ["2026-12-25"]

    r = client.put(f"/api/projects/{pid}", json=project)
    assert r.status_code == 200
    assert r.json()["horizon"]["work_start_slot"] == 19

    again = client.get(f"/api/projects/{pid}").json()["project"]
    assert again["calendar"]["work_start"] == "09:30"
    assert again["calendar"]["holidays"] == ["2026-12-25"]


def test_put_rejects_invalid_project(client):
    pid = default_pid(client)
    project = client.get(f"/api/projects/{pid}").json()["project"]
    project["tasks"][0]["minutes"] = 45  # not slot-aligned
    assert client.put(f"/api/projects/{pid}", json=project).status_code == 422


def test_import_project(client):
    pid = default_pid(client)
    data = client.get(f"/api/projects/{pid}").json()["project"]
    data["name"] = "Imported copy"
    r = client.post("/api/projects/import", json=data)
    assert r.status_code == 200
    assert r.json()["name"] == "Imported copy"

    assert (
        client.post(
            "/api/projects/import", json={"tasks": [{"id": "x", "name": "bad", "minutes": 45}]}
        ).status_code
        == 422
    )


def _solve_and_wait(client, pid, timeout=30.0):
    import time as _time

    job_id = client.post(f"/api/projects/{pid}/solve").json()["job_id"]
    deadline = _time.monotonic() + timeout
    while _time.monotonic() < deadline:
        d = client.get(f"/api/solve/{job_id}").json()
        if d["status"] != "running":
            return job_id, d
        _time.sleep(0.1)
    raise AssertionError("solve did not finish in time")


def test_solve_job_runs_and_persists_schedule(client):
    pid = default_pid(client)
    _job, d = _solve_and_wait(client, pid)
    assert d["status"] == "done"
    assert d["schedule"]["status"] in ("OPTIMAL", "FEASIBLE")
    assert d["schedule"]["tasks"]
    assert "horizon" in d

    stored = client.get(f"/api/projects/{pid}").json()
    assert stored["project"]["schedule"]["status"] == d["schedule"]["status"]


def test_solve_status_unknown_job_is_404(client):
    assert client.get("/api/solve/nope").status_code == 404
    assert client.post("/api/solve/nope/cancel").status_code == 404


def test_solve_cancel_is_accepted(client):
    pid = default_pid(client)
    job_id = client.post(f"/api/projects/{pid}/solve").json()["job_id"]
    assert client.post(f"/api/solve/{job_id}/cancel").status_code == 200
    # the job still reaches a terminal state (done if it already had a solution,
    # or cancelled if stopped first)
    import time as _time

    deadline = _time.monotonic() + 30.0
    while _time.monotonic() < deadline:
        status = client.get(f"/api/solve/{job_id}").json()["status"]
        if status != "running":
            assert status in ("done", "cancelled")
            return
        _time.sleep(0.1)
    raise AssertionError("cancelled solve did not settle")


def test_backups_listed_and_restored(client):
    pid = default_pid(client)
    project = client.get(f"/api/projects/{pid}").json()["project"]
    original = project["calendar"]["work_start"]

    # deleting-like force snapshot: rename triggers save -> time-based snapshot
    client.patch(f"/api/projects/{pid}", json={"name": "Snap"})
    backups = client.get(f"/api/projects/{pid}/backups").json()["backups"]
    assert backups, "a snapshot should exist after the first save"

    project["calendar"]["work_start"] = "10:30"
    project["name"] = "Snap"
    client.put(f"/api/projects/{pid}", json=project)

    r = client.post(f"/api/projects/{pid}/backups/{backups[0]['name']}/restore")
    assert r.status_code == 200
    restored = client.get(f"/api/projects/{pid}").json()["project"]
    assert restored["calendar"]["work_start"] == original

    assert client.post(f"/api/projects/{pid}/backups/evil.json/restore").status_code == 404


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

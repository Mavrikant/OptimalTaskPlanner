import pytest
from fastapi.testclient import TestClient

from labplanner.api import create_app
from labplanner.config import Settings


@pytest.fixture
def settings(tmp_path):
    return Settings(data_dir=tmp_path / "data", days=14, solver_time_limit_s=10.0)


@pytest.fixture
def client(settings):
    with TestClient(create_app(settings)) as c:
        yield c

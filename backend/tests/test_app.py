import pytest

from app.main import app


def test_app_instantiates():
    """Verify the FastAPI app and its routes load correctly."""
    routes = [r.path for r in app.routes]
    assert "/health" in routes


@pytest.mark.integration
def test_reads_require_auth(unauth_client):
    """Every data read is behind auth; only /health stays open."""
    assert unauth_client.get("/seasons").status_code == 401
    assert unauth_client.get("/health").status_code == 200

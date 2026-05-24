from app.main import app


def test_app_instantiates():
    """Verify the FastAPI app and its routes load correctly."""
    routes = [r.path for r in app.routes]
    assert "/health" in routes

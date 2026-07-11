FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/
WORKDIR /app

# Install dependencies first so this layer caches across code-only changes
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY app ./app
RUN uv sync --frozen --no-dev

EXPOSE 8000
# Exec the venv's binary directly, not "uv run" -- uv run re-syncs (including
# dev deps) on every start unless told otherwise, which means an unnecessary
# network dependency and slower boot for something already fully resolved at
# build time.
CMD [".venv/bin/uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

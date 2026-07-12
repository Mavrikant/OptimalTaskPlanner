# Debian-based on purpose: ortools ships no musl (Alpine) wheels.
FROM python:3.13-slim AS build
WORKDIR /build
COPY pyproject.toml README.md LICENSE ./
COPY src ./src
RUN pip wheel --no-deps --wheel-dir /wheels .

FROM python:3.13-slim
COPY --from=build /wheels /wheels
RUN pip install --no-cache-dir /wheels/*.whl && rm -rf /wheels
# /data is created (and chowned) before USER so anonymous volumes stay writable.
RUN useradd --create-home --uid 1000 app \
    && mkdir /data && chown app:app /data
USER app
ENV OPTIMAL_TASK_PLANNER_HOST=0.0.0.0 \
    OPTIMAL_TASK_PLANNER_DATA_DIR=/data \
    OPTIMAL_TASK_PLANNER_NO_BROWSER=1
VOLUME /data
EXPOSE 8000
# stdlib health probe: the slim image has no curl/wget.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD \
    python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=2)"
CMD ["optimal-task-planner"]

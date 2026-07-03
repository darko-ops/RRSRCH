FROM python:3.11-slim
WORKDIR /app
COPY pyproject.toml ./
COPY src ./src
COPY alembic.ini ./
COPY alembic ./alembic
RUN pip install --no-cache-dir -e .
ENV PYTHONPATH=/app/src
EXPOSE 8000
CMD ["rrsrch-api"]

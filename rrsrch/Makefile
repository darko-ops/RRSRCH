.PHONY: up down migrate test eval lint
PYTHON ?= python3

up:            ## start Postgres+pgvector and the app (migrates on boot)
	docker compose up -d --build

down:
	docker compose down

migrate:       ## run DB migrations against a running Postgres
	alembic upgrade head

test:          ## run the unit tests (offline; no Postgres needed)
	$(PYTHON) -m pytest -q

eval:          ## run the matching eval and print the three exit numbers
	PYTHONPATH=src $(PYTHON) -m eval.run_eval

lint:
	ruff check src tests eval && mypy src

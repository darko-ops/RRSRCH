.PHONY: up down migrate test test-pg eval demo verify-loop verify-live flywheel steering lint
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

demo:          ## walk the 3 worked examples and print the savings report
	PYTHONPATH=src $(PYTHON) scripts/demo.py

verify-loop:   ## run the self-verification worker (needs RRSRCH_PROVIDER=claude-cli)
	rrsrch-verify

verify-live:   ## ONE real proof-of-search cycle against live data (costs tokens)
	RRSRCH_PROVIDER=claude-cli PYTHONPATH=src $(PYTHON) scripts/live_cycle.py

test-pg:       ## the full suite against real Postgres (docker compose up -d db first)
	RRSRCH_TEST_STORE=postgres $(PYTHON) -m pytest -q

flywheel:      ## flywheel curve on labeled Zipf traffic (Postgres+MiniLM, ~5 min)
	RRSRCH_STORE=postgres RRSRCH_EMBEDDER=minilm PYTHONPATH=src:. $(PYTHON) scripts/flywheel_report.py

steering:      ## show the budget-steering curves (exit criterion 2)
	$(PYTHON) -m pytest -s -q tests/test_phase1_exit.py::test_exit_2_budget_steers_to_the_volatile_topic

lint:
	ruff check src tests eval scripts && mypy src

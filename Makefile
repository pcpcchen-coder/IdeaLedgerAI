# 開發指令。第一次使用先 make setup。
PYTHON ?= python3

.PHONY: setup build test test-ext test-collector test-summarizer test-scripts test-deploy

setup:
	cd extension && npm install --no-audit --no-fund
	$(PYTHON) -m pip install -r collector/requirements.txt -r summarizer/requirements.txt

build:
	cd extension && npm run build

test: test-ext test-collector test-summarizer test-scripts test-deploy

test-ext:
	cd extension && npm test

test-collector:
	cd collector && $(PYTHON) -m pytest -q

test-summarizer:
	$(PYTHON) -m pytest -q summarizer/tests

test-scripts:
	$(PYTHON) -m pytest -q scripts/tests

test-deploy:
	$(PYTHON) -m pytest -q deploy/tests

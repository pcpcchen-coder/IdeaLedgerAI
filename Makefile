# 開發指令。第一次使用先 make setup。
PYTHON ?= python3

.PHONY: setup build test test-ext test-collector test-scripts

setup:
	cd extension && npm install --no-audit --no-fund
	$(PYTHON) -m pip install -r collector/requirements.txt

build:
	cd extension && npm run build

test: test-ext test-collector test-scripts

test-ext:
	cd extension && npm test

test-collector:
	cd collector && $(PYTHON) -m pytest -q

test-scripts:
	$(PYTHON) -m pytest -q scripts/tests

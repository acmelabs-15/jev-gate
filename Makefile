.PHONY: test typecheck check report report-week report-json tail

BUN ?= bun

## Tests and type check (no network, no API key needed)
test:
	$(BUN) test

typecheck:
	$(BUN) x tsc -p .

check: typecheck test

## Read the shadow log. Pass extra flags with ARGS, e.g. make report ARGS="--top 30"
report:
	$(BUN) report.ts $(ARGS)

report-week:
	$(BUN) report.ts --since 7d $(ARGS)

report-json:
	$(BUN) report.ts --json $(ARGS)

## Watch new log lines as they arrive
tail:
	tail -f $${JEV_GATE_LOG:-$$HOME/.claude/jev-gate/log.jsonl}

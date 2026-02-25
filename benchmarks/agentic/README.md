# Agentic Debugging Benchmark

Proves that What Framework + devtools-mcp = the most economical agentic platform.

## Thesis

AI agents debugging What Framework apps with MCP tools use **50-70% fewer tokens**, make **50-60% fewer tool calls**, take **60-75% less time**, and achieve **15-25% higher accuracy** compared to baseline (screenshot + file-reading only).

## Quick Start

```bash
# Set your API key
export ANTHROPIC_API_KEY=sk-...

# Run all fixtures (5 runs each, 70 total trials)
node runner.js

# Run a single fixture
node runner.js --fixture 01

# Custom number of runs
node runner.js --fixture 01 --runs 3

# View results
open dashboard/index.html
```

## 7 Fixture Apps

| # | Scenario | Bug | Why MCP Wins |
|---|----------|-----|-------------|
| 01 | Signal Not Reactive | `{count}` instead of `{() => count()}` | `what_signals` shows value is correct → binding is wrong |
| 02 | Stale Closure | Effect captures value outside reactive context | `what_effects` shows missing dependency |
| 03 | Effect Infinite Loop | Effect reads+writes same signal | `what_errors` returns loop warning |
| 04 | Missing Context Provider | `useContext()` without Provider | `what_components` shows no Provider in tree |
| 05 | Cache Key Collision | Two `useSWR` calls with same key | `what_cache` shows single entry |
| 06 | Event Handler Subscription | Excessive re-renders from signal tracking | `what_effects` shows high runCount |
| 07 | Wrong Reconciliation Key | `key={index}` instead of `key={item.id}` | `what_snapshot` shows state mismatch |

## Methodology

**Without MCP (baseline)**: `read_file`, `edit_file`, `playwright_screenshot`, `playwright_console`, `playwright_evaluate`

**With MCP (treatment)**: All baseline + `what_signals`, `what_effects`, `what_components`, `what_snapshot`, `what_errors`, `what_watch`, `what_cache`, `what_set_signal`

5 runs per scenario per mode. Claude API with `temperature=0` for reproducibility.

## Metrics

- Total tokens (input + output)
- API round trips
- Tool calls (total + breakdown)
- Screenshot count
- Time to fix (ms)
- Fix correctness (Playwright verification)
- Peak context window tokens

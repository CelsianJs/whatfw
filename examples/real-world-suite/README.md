# What Framework Real-World Example Suite

5 example apps using `what-framework@0.5.5` and `what-compiler@0.5.5` from npm. Each demonstrates a different real-world scenario, tested with Playwright.

## Apps

| App | Port | Scenario |
|-----|------|----------|
| `app-01-simple-counter-todo` | 5501 | Basic signals, computed, lists, conditionals |
| `app-02-api-cache-dashboard` | 5502 | `useSWR`, cache invalidation, polling, error handling |
| `app-03-global-state` | 5503 | `createStore`, `derived()`, complex state management |
| `app-04-virtual-table` | 5504 | Virtualized 10K-row table, sorting, filtering |
| `app-05-react-compat` | 5505 | `what-react` + zustand, mixing React packages with What |

## Setup

```bash
# Install each app
for dir in app-01-* app-02-* app-03-* app-04-* app-05-*; do
  (cd "$dir" && npm install)
done

# Run tests
npm install
npx playwright test
```

## Dev Logs

Each app includes a `DEVLOG.md` written from an agent developer's perspective, documenting mistakes, surprises, and gotchas encountered while building with What Framework for the first time.

## Key Findings

See `AGENT-SYNTHESIS.md` for the combined analysis across all 5 agent developers.

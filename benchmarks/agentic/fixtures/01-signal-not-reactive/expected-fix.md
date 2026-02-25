# Expected Fix
Change `h('p', { id: 'count-display' }, count)` to `h('p', { id: 'count-display' }, () => count())`.
The signal reference `count` passes the function itself as a static child. Wrapping in `() => count()` makes it a reactive function child that re-evaluates when the signal changes.

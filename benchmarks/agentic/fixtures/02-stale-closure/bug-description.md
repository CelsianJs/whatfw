# Bug: Stale Closure
The "Doubled" value doesn't update when count changes. Count updates correctly but Doubled stays at 0.
The effect that computes doubled is supposed to re-run when count changes.

# Expected Fix
Remove `const currentCount = count.peek();` and change the effect to read `count()` directly:
```effect(() => { doubled(count() * 2); });```
Reading `count()` inside the effect creates a reactive dependency. `count.peek()` reads without tracking.

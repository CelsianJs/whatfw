# Expected Fix
Use `untrack()` to read the signal without subscribing:
```
import { untrack } from 'what-core';
effect(() => {
  const current = untrack(() => count());
  log(prev => [...prev, `Count changed to ${current}`]);
});
```
Or restructure so the effect only reads OR writes to count, not both. The effect should subscribe to count via count() for the logging, but the write should be triggered by a user action instead.

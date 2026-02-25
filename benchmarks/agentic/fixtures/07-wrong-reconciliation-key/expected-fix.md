# Expected Fix
Change `key: index` to `key: todo.id`:
```
() => todos().map((todo, index) =>
  h(TodoItem, { key: todo.id, todo, onToggle: toggle })
)
```
Using a stable unique ID as key allows the reconciler to track items through reordering.

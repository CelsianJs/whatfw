# Bug: Wrong Reconciliation Key
After clicking "Reverse Order", the checkboxes don't follow their items. "Build App" should stay checked after reversing, but the check mark stays in the middle position.
The list items are keyed by array index instead of unique ID, so the reconciler reuses DOM nodes at wrong positions.

# Bug: Event Handler Subscription / Excessive Re-renders
The render count increases excessively when clicking items. Each click triggers far more renders than expected.
The component effect is re-running unnecessarily because of signal subscription patterns.
Check effect dependencies and run counts to identify the over-triggering effect.

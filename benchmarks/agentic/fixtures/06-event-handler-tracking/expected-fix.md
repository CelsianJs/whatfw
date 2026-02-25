# Expected Fix
The effect that increments renderCount is subscribing to signals unintentionally due to the component re-render cycle. The fix is to make the effect only track what it needs. The render-counting effect reads renderCount.peek() which is fine — the real issue is the component itself re-renders due to selectedIndex being read at the top-level component scope.

Move the selectedIndex reads into reactive function children so only the specific elements update:
The `class` and `style` props already use `() =>` wrappers which is correct. The main fix is removing the unnecessary effect that counts renders or ensuring it doesn't cause cascading updates.

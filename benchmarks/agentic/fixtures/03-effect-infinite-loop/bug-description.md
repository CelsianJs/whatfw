# Bug: Effect Infinite Loop
Console shows "[what] Possible infinite effect loop detected". The app may freeze or show incorrect state.
An effect is both reading and writing to the same signal, causing it to re-trigger itself endlessly.

# Bug: Missing Context Provider
The ThemedButton always shows the default theme ("light") and never responds to theme toggle.
The theme signal is being toggled correctly, but the context value never reaches the child component.

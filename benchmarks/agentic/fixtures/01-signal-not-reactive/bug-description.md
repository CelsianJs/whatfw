# Bug: Signal Not Reactive
The counter display doesn't update when clicking the increment button.
The signal value IS being updated (verified via devtools), but the DOM text doesn't change.
Look for: signal binding that isn't wrapped in a reactive function.

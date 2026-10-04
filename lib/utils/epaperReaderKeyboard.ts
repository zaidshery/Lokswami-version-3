/** Reader shortcuts must leave native editing and browser shortcuts intact. */
export function epaperReaderKeyboardAction(event: KeyboardEvent) {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return null;
  const target = event.target;
  if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')) {
    return null;
  }
  switch (event.key) {
    case 'ArrowRight': return 'next';
    case 'ArrowLeft': return 'previous';
    case 'Home': return 'first';
    case 'End': return 'last';
    case '+': case '=': return 'zoom-in';
    case '-': case '_': return 'zoom-out';
    case '0': return 'reset';
    case 'Escape': return 'escape';
    default: return null;
  }
}

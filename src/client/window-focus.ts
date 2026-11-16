// the focus a window that rebuilds itself after each action (Sheet, Equipment) gives back: the button with the same name,
// else `first`. By name, not position (review of Nov 16): equipping adds or drops rows, so the same index was another button
export const nameOf = (b: Element) => b.getAttribute('aria-label') ?? b.textContent ?? '';
export const refocus = (overlay: HTMLElement, name: string, first: string) =>
  (
    [...overlay.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')].find((b) => name && nameOf(b) === name) ??
    overlay.querySelector<HTMLButtonElement>(first)
  )?.focus();
export const focused = () =>
  document.activeElement instanceof HTMLButtonElement ? nameOf(document.activeElement) : '';

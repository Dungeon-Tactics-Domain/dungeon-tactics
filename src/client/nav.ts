// One page for the whole game (Fernando, Nov 18: a phone left fullscreen at each change of screen, because each was a
// page of its own): `navigate` swaps the screen in place and what a screen holds leaves with it. No imports, so the
// screens that navigate (crawl.ts, title.ts, boot.ts) and the entry that mounts them never form a cycle.
let open: ((search: string) => void) | null = null;
let scope = new AbortController();

// entry.ts: how a screen is mounted
export const onNavigate = (fn: (search: string) => void) => {
  open = fn;
};

// To the screen an address opens: '?home' the town, '?room=3' a room, '' the title. The address is replaced, never
// pushed: a reload shows the same screen and the phone's Back button does not walk the game's screens
export function navigate(search: string) {
  if (open) open(search);
  else location.search = search; // no page mounted (the tests of boot.ts and crawl.ts): the address alone
}

// Aborted when the screen in view leaves: its window listeners take it as their `signal`, its frame loops stop on it
export const screenSignal = () => scope.signal;
// what the screen must let go of (a scene, a 3D layer, a timer)
export const onLeave = (fn: () => void) => scope.signal.addEventListener('abort', fn, { once: true });
// entry.ts: the screen in view leaves, before the next one is built
export function leaveScreen() {
  scope.abort();
  scope = new AbortController();
}

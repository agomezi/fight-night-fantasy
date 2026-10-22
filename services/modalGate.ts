// One full-screen card at a time. The "what's new" card holds the gate while
// it decides whether to show and while it's open; the awards reveal waits for
// it to be free, so the two never stack.

import { useEffect, useState } from "react";

let holds = 0;
const listeners = new Set<() => void>();

function changed() {
  for (const fn of listeners) fn();
}

/** Holds the gate until the returned release is called (once). */
export function holdModal(): () => void {
  holds += 1;
  changed();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds -= 1;
    changed();
  };
}

export function modalsFree(): boolean {
  return holds === 0;
}

/** True while nothing else holds the gate. */
export function useModalsFree(): boolean {
  const [free, setFree] = useState(modalsFree());
  useEffect(() => {
    const fn = () => setFree(modalsFree());
    listeners.add(fn);
    fn();
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return free;
}

import { useEffect, useRef } from "react";

/** True until `ready` content has rendered once. Rows animate in on the first
 * load and not again: a live refresh that reorders them would replay the
 * entrance mid-layout and stack two rows on top of each other. */
export function useEntranceOnce(ready: boolean): boolean {
  const done = useRef(false);
  const animate = !done.current;
  useEffect(() => {
    if (ready) done.current = true;
  }, [ready]);
  return animate;
}

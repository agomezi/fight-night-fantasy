import { clearCache, readCache, writeCache } from "../screenCache";

test("keeps what a screen loaded until sign-out clears it", () => {
  expect(readCache("history:a")).toBeUndefined();
  expect(writeCache("history:a", { points: 5 })).toEqual({ points: 5 });
  expect(readCache("history:a")).toEqual({ points: 5 });
  // A loaded "nothing" is still a hit, so a screen with no card skips its skeleton too.
  writeCache("next-event", null);
  expect(readCache("next-event")).toBeNull();
  clearCache();
  expect(readCache("history:a")).toBeUndefined();
});

test("no key, no cache", () => {
  writeCache(null, 1);
  expect(readCache(null)).toBeUndefined();
});

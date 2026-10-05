import { suppressPress, type SwipeGuard } from "../../components/swipeGuard";

const guard = (over: Partial<SwipeGuard> = {}): SwipeGuard => ({
  swiping: false,
  endedAt: 0,
  pressStart: { x: 100, y: 100 },
  ...over,
});

describe("suppressPress", () => {
  test("a press outside a carousel always goes through", () => {
    expect(suppressPress(null, { x: 0, y: 0 })).toBe(false);
  });

  test("a tap on a card goes through", () => {
    expect(suppressPress(guard(), { x: 104, y: 98 }, 10_000)).toBe(false);
  });

  test("a press during a swipe, or just after one, is the swipe", () => {
    expect(suppressPress(guard({ swiping: true }), { x: 100, y: 100 }, 10_000)).toBe(true);
    expect(suppressPress(guard({ endedAt: 9_800 }), { x: 100, y: 100 }, 10_000)).toBe(true);
    expect(suppressPress(guard({ endedAt: 9_000 }), { x: 100, y: 100 }, 10_000)).toBe(false);
  });

  test("a press that travelled is a drag, not a tap", () => {
    expect(suppressPress(guard(), { x: 140, y: 100 }, 10_000)).toBe(true);
    expect(suppressPress(guard(), { x: 100, y: 130 }, 10_000)).toBe(true);
  });
});

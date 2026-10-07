import { render } from "@testing-library/react-native";
import ProgressRing from "../ProgressRing";

// Records where the ring starts and every animation it asks for. Animations
// land at once. `sweeps` holds each mounted ring's value, `starts` the value
// it opened at.
const sweeps: { value: number }[] = [];
const starts: number[] = [];
const mockTiming = jest.fn((to: number, _config?: unknown) => to);
const mockDelay = jest.fn((_ms: number, animation: number) => animation);

jest.mock("react-native-reanimated", () => {
  const { useRef } = jest.requireActual("react");
  return {
    __esModule: true,
    default: { createAnimatedComponent: (C: unknown) => C },
    useSharedValue: (initial: number) => {
      const ref = useRef(null);
      if (!ref.current) {
        ref.current = { value: initial };
        sweeps.push(ref.current);
        starts.push(initial);
      }
      return ref.current;
    },
    useAnimatedProps: (fn: () => object) => fn(),
    withTiming: (to: number, config?: unknown) => mockTiming(to, config),
    withDelay: (ms: number, animation: number) => mockDelay(ms, animation),
  };
});

jest.mock("../../context/ThemeContext", () => ({
  useTheme: () => ({ c: { borderStrong: "#333", red: "#e8003d", text: "#fff", textMuted: "#999" } }),
}));

beforeEach(() => {
  sweeps.length = 0;
  starts.length = 0;
  mockTiming.mockClear();
  mockDelay.mockClear();
});

const animations = () => mockTiming.mock.calls.length + mockDelay.mock.calls.length;
const last = () => sweeps[sweeps.length - 1];

describe("ProgressRing", () => {
  it("opens at its value with no sweep", () => {
    render(<ProgressRing value={3} total={4} />);
    expect(starts).toEqual([0.75]);
    expect(animations()).toBe(0);
  });

  it("shows an empty ring at 0, without animating", () => {
    render(<ProgressRing value={0} total={7} />);
    expect(last().value).toBe(0);
    expect(animations()).toBe(0);
  });

  it("does not sweep again when swiped away and back (a remount)", () => {
    const first = render(<ProgressRing value={2} total={5} />);
    first.unmount();
    render(<ProgressRing value={2} total={5} />);
    expect(sweeps).toHaveLength(2);
    expect(last().value).toBe(0.4);
    expect(animations()).toBe(0);
  });

  it("does not animate when re-rendered with the same value", () => {
    const ring = render(<ProgressRing value={2} total={5} />);
    ring.rerender(<ProgressRing value={2} total={5} caption="of 5" />);
    expect(animations()).toBe(0);
  });

  it("animates from the old value to the new one when progress changes", () => {
    const ring = render(<ProgressRing value={2} total={7} />);
    expect(last().value).toBeCloseTo(2 / 7);
    ring.rerender(<ProgressRing value={3} total={7} />);
    expect(mockTiming).toHaveBeenCalledTimes(1);
    expect(mockTiming.mock.calls[0][0]).toBeCloseTo(3 / 7);
    // No delay and no reset to zero: it carries on from where it was.
    expect(mockDelay).not.toHaveBeenCalled();
    expect(sweeps).toHaveLength(1);
  });

  it("animates a pick cleared, back down", () => {
    const ring = render(<ProgressRing value={3} total={7} />);
    ring.rerender(<ProgressRing value={2} total={7} />);
    expect(mockTiming).toHaveBeenCalledTimes(1);
    expect(mockTiming.mock.calls[0][0]).toBeCloseTo(2 / 7);
  });

  it("sweeps in from empty when asked to", () => {
    render(<ProgressRing value={1} total={2} animateOnMount delay={200} />);
    expect(starts).toEqual([0]);
    expect(mockDelay).toHaveBeenCalledTimes(1);
    expect(mockDelay.mock.calls[0][0]).toBe(200);
    expect(mockTiming.mock.calls[0][0]).toBe(0.5);
  });

  it("keeps the figure and caption in the middle", () => {
    const ring = render(<ProgressRing value={1} total={4} center="4th" caption="of 4" />);
    expect(ring.getByText("4th")).toBeTruthy();
    expect(ring.getByText("of 4")).toBeTruthy();
  });

  it("clamps progress past the total and treats an empty total as 0", () => {
    render(<ProgressRing value={9} total={4} />);
    expect(last().value).toBe(1);
    render(<ProgressRing value={1} total={0} />);
    expect(last().value).toBe(0);
  });
});

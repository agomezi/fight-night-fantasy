import { fireEvent, render, screen } from "@testing-library/react-native";
import { useFightStats } from "../../hooks/useFightStats";
import type { BoutLine } from "../../services/eventDetail";
import type { BoutStats } from "../../services/fightStats";
import { parseFightStats } from "../../services/ingestion/fightStats";
import FightStatsSheet from "../FightStatsSheet";

// Animation and presses are stood in for, so these test what shows.
jest.mock("react-native-reanimated", () => {
  const { View } = jest.requireActual("react-native");
  return {
    __esModule: true,
    default: { View, createAnimatedComponent: (C: unknown) => C },
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    withTiming: (v: unknown) => v,
  };
});
jest.mock("../PressableScale", () => {
  const { Pressable } = jest.requireActual("react-native");
  return { __esModule: true, default: Pressable };
});
jest.mock("../Skeleton", () => () => null);
jest.mock("../LiveDot", () => () => null);
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("../../context/ThemeContext", () => {
  const { palettes } = jest.requireActual("../../constants/palette");
  const c = palettes.dark;
  return { useTheme: () => ({ c }), useThemedStyles: (make: (p: unknown) => unknown) => make(c) };
});
jest.mock("../../hooks/useFightStats", () => ({ useFightStats: jest.fn() }));

const hook = useFightStats as jest.MockedFunction<typeof useFightStats>;
const parsed = parseFightStats(require("../../services/ingestion/__fixtures__/live-stats/fight-13002-final.json"))!;
const final: BoutStats = { ...parsed, live: false, round: null, clock: null, updatedAt: "2026-10-18T03:00:00Z" };

const bout: BoutLine = {
  id: "b1",
  order: 1,
  weightClass: "Welterweight",
  red: { name: "Joaquin Buckley", initials: "JB", photoUrl: null, won: false },
  blue: { name: "Mike Malott", initials: "MM", photoUrl: null, won: true },
  state: "final",
  result: "KO/TKO · R2 1:47",
  pick: "Malott · KO",
  verdict: "hit",
  points: "+120",
};

beforeEach(() => hook.mockReset());

test("closed: loads nothing", () => {
  hook.mockReturnValue({ status: "loading" });
  render(<FightStatsSheet bout={null} onClose={() => {}} />);
  expect(hook).toHaveBeenCalledWith(null, false);
  expect(screen.queryByText("SIG. STRIKES LANDED")).toBeNull();
});

test("tale of the tape for the whole fight, then one round", () => {
  hook.mockReturnValue({ status: "ready", stats: final });
  render(<FightStatsSheet bout={bout} onClose={() => {}} />);
  expect(hook).toHaveBeenCalledWith("b1", false);
  expect(screen.getByText("WELTERWEIGHT")).toBeTruthy();
  expect(screen.getByText("OFFICIAL")).toBeTruthy();
  expect(screen.getByText("14")).toBeTruthy();
  expect(screen.getByText("37")).toBeTruthy();
  expect(screen.getByText("YOUR PICK · MALOTT · KO")).toBeTruthy();
  expect(screen.getByText("TOTAL STRIKES")).toBeTruthy();
  expect(screen.getByText("Official")).toBeTruthy();

  fireEvent.press(screen.getByText("R1"));
  expect(screen.getByText("9")).toBeTruthy();
  expect(screen.getByText("15")).toBeTruthy();
  expect(screen.queryByText("37")).toBeNull();

  fireEvent.press(screen.getByText("All"));
  expect(screen.getByText("37")).toBeTruthy();
});

test("live, unofficial, with the round clock", () => {
  hook.mockReturnValue({ status: "ready", stats: { ...final, official: false, live: true, round: 2, clock: "3:14" } });
  render(<FightStatsSheet bout={{ ...bout, state: "live", pick: null }} onClose={() => {}} />);
  expect(screen.getByText("LIVE · R2 3:14")).toBeTruthy();
  expect(screen.getByText("Unofficial · updates as the fight goes")).toBeTruthy();
  expect(screen.queryByText(/YOUR PICK/)).toBeNull();
});

test("before the stats start, and after a failed load", () => {
  hook.mockReturnValue({ status: "ready", stats: null });
  const { rerender } = render(<FightStatsSheet bout={{ ...bout, state: "live" }} onClose={() => {}} />);
  expect(screen.getByText("Stats start when the fight does.")).toBeTruthy();
  expect(screen.getByText("LIVE")).toBeTruthy();

  rerender(<FightStatsSheet bout={bout} onClose={() => {}} />);
  expect(screen.getByText("No stats for this fight yet.")).toBeTruthy();

  hook.mockReturnValue({ status: "error", message: "boom" });
  rerender(<FightStatsSheet bout={bout} onClose={() => {}} />);
  expect(screen.getByText("Couldn't load the stats. Try again in a moment.")).toBeTruthy();
});

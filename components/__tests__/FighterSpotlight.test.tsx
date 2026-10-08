import { fireEvent, render, screen } from "@testing-library/react-native";
import { spotlightFighters, toNextEvent } from "../../services/events";
import FighterSpotlight from "../FighterSpotlight";

// Animation and presses are stood in for, so these test what shows.
jest.mock("../PressableScale", () => {
  const { Pressable } = jest.requireActual("react-native");
  return { __esModule: true, default: Pressable };
});
jest.mock("../FighterPhoto", () => {
  const { Text } = jest.requireActual("react-native");
  return { __esModule: true, default: ({ initials }: { initials: string }) => <Text>{initials}</Text> };
});
jest.mock("../../context/ThemeContext", () => {
  const { palettes } = jest.requireActual("../../constants/palette");
  const c = palettes.dark;
  return { useTheme: () => ({ c }), useThemedStyles: (make: (p: unknown) => unknown) => make(c) };
});

const fighter = (id: string, name: string, extra: object = {}) => ({
  id, name, nickname: null, photoUrl: null, wins: null, losses: null, draws: null, noContests: null,
  dob: null, heightIn: null, reachIn: null, ...extra,
});

const event = toNextEvent({
  id: "e",
  name: "UFC 332: Pereira vs. Ankalaev",
  starts_at: "2026-10-03T20:00:00+00:00",
  locks_at: "2026-10-03T20:00:00+00:00",
  status: "scheduled",
  bouts: [
    {
      id: "a",
      fight_order: 1,
      card_segment: "main",
      scheduled_rounds: 5,
      weight_class: "Light Heavyweight",
      version: 1,
      status: "scheduled",
      locks_at: null,
      underdog_corner: "blue",
      red: fighter("p", "Alex Pereira", {
        nickname: "Poatan", wins: 12, losses: 3, draws: 0, noContests: 0,
        dob: "1987-07-07", heightIn: 76, reachIn: 79,
      }),
      blue: fighter("k", "Magomed Ankalaev", { wins: 21, losses: 1, draws: 1, noContests: 1 }),
    },
  ],
});
const now = new Date("2026-10-01T12:00:00Z");

test("shows the main event's red corner with record and measurements", () => {
  render(<FighterSpotlight fighters={spotlightFighters(event)} now={now} />);
  expect(screen.getByText("ALEX PEREIRA")).toBeTruthy();
  expect(screen.getByText("“Poatan”")).toBeTruthy();
  expect(screen.getByText("LIGHT HEAVYWEIGHT · 12-3-0")).toBeTruthy();
  expect(screen.getByText("39")).toBeTruthy();
  expect(screen.getByText(`6'4"`)).toBeTruthy();
  expect(screen.getByText(`79"`)).toBeTruthy();
  expect(screen.getByText(/Headlines against Magomed Ankalaev/)).toBeTruthy();
  expect(screen.queryByText("DOG")).toBeNull();
});

test("switches to the opponent, tagged as the underdog, with dashes for what's missing", () => {
  render(<FighterSpotlight fighters={spotlightFighters(event)} now={now} />);
  fireEvent.press(screen.getByText("ANKALAEV"));
  expect(screen.getByText("MAGOMED ANKALAEV")).toBeTruthy();
  expect(screen.getByText("LIGHT HEAVYWEIGHT · 21-1-1 (1 NC)")).toBeTruthy();
  expect(screen.getByText("DOG")).toBeTruthy();
  expect(screen.getAllByText("—")).toHaveLength(3);
});

test("a placeholder while the card loads, and a note when there's no card", () => {
  const { rerender } = render(<FighterSpotlight fighters={null} now={now} />);
  expect(screen.getByTestId("spotlight-loading")).toBeTruthy();
  rerender(<FighterSpotlight fighters={[]} now={now} />);
  expect(screen.getByText("The spotlight returns once the next card is announced.")).toBeTruthy();
});

import { fireEvent, render, screen } from "@testing-library/react-native";
import type { LeagueDrop } from "../../services/awards";
import AwardsReveal from "../AwardsReveal";

// Animation and presses are stood in for, so these test what shows.
jest.mock("react-native-reanimated", () => {
  const { View } = jest.requireActual("react-native");
  return {
    __esModule: true,
    default: { View, createAnimatedComponent: (C: unknown) => C },
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    withTiming: (v: unknown) => v,
    withDelay: (_: number, v: unknown) => v,
    Easing: { out: () => undefined, quad: undefined },
  };
});
jest.mock("../../constants/motion", () => ({ appear: () => undefined }));
jest.mock("../PressableScale", () => {
  const { Pressable } = jest.requireActual("react-native");
  return { __esModule: true, default: Pressable };
});
jest.mock("../RankMark", () => () => null);
jest.mock("../../context/ThemeContext", () => {
  const { palettes } = jest.requireActual("../../constants/palette");
  const c = palettes.dark;
  return { useTheme: () => ({ c }), useThemedStyles: (make: (p: unknown) => unknown) => make(c) };
});

const drop: LeagueDrop = {
  drop: { id: "d1", label: "Check-in", kind: "checkin" },
  awards: [{ award: "interim_champ", userId: "u1", name: "Player One", value: null }],
  p4p: null,
  table: [],
  myPlaces: {},
};

function show() {
  const onClose = jest.fn();
  render(<AwardsReveal leagueName="Test League" drop={drop} myId="u2" onClose={onClose} />);
  return onClose;
}

describe("AwardsReveal", () => {
  it("closes when tapping outside the card", () => {
    const onClose = show();
    fireEvent.press(screen.getAllByLabelText("Close")[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("has a close button on the card", () => {
    const onClose = show();
    const buttons = screen.getAllByLabelText("Close");
    expect(buttons).toHaveLength(2);
    fireEvent.press(buttons[1]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("still closes from the button at the bottom", () => {
    const onClose = show();
    fireEvent.press(screen.getByText("NICE"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

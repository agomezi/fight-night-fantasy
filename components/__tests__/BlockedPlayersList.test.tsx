import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { loadBlocked, unblockPlayer } from "../../services/blocks";
import BlockedPlayersList from "../BlockedPlayersList";

jest.mock("../../context/ProfileContext", () => ({
  getInitials: (name: string) => name.slice(0, 2).toUpperCase(),
}));
jest.mock("../PressableScale", () => {
  const { Pressable } = jest.requireActual("react-native");
  return { __esModule: true, default: Pressable };
});
jest.mock("../../context/ThemeContext", () => {
  const { palettes } = jest.requireActual("../../constants/palette");
  const c = palettes.dark;
  return { useTheme: () => ({ c }), useThemedStyles: (make: (p: unknown) => unknown) => make(c) };
});
jest.mock("../../services/blocks", () => ({ loadBlocked: jest.fn(), unblockPlayer: jest.fn() }));

const load = loadBlocked as jest.MockedFunction<typeof loadBlocked>;
const unblock = unblockPlayer as jest.MockedFunction<typeof unblockPlayer>;

const ben = { userId: "u-ben", name: "Ben", blockedAt: new Date("2026-10-08T00:00:00Z") };
const cal = { userId: "u-cal", name: "Cal", blockedAt: new Date("2026-10-07T00:00:00Z") };

beforeEach(() => {
  load.mockReset();
  unblock.mockReset();
});

describe("BlockedPlayersList", () => {
  it("lists blocked players by name", async () => {
    load.mockResolvedValue([ben, cal]);
    render(<BlockedPlayersList />);
    expect(await screen.findByText("Ben")).toBeTruthy();
    expect(screen.getByText("Cal")).toBeTruthy();
  });

  it("unblocks a player and takes them off the list", async () => {
    load.mockResolvedValue([ben, cal]);
    unblock.mockResolvedValue();
    render(<BlockedPlayersList />);
    await screen.findByText("Ben");
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Unblock Ben"));
    });
    expect(unblock).toHaveBeenCalledWith("u-ben");
    expect(screen.queryByText("Ben")).toBeNull();
    expect(screen.getByText("Cal")).toBeTruthy();
  });

  it("keeps a player listed when unblocking fails", async () => {
    load.mockResolvedValue([ben]);
    unblock.mockRejectedValue(new Error("offline"));
    render(<BlockedPlayersList />);
    await screen.findByText("Ben");
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Unblock Ben"));
    });
    expect(screen.getByText("Ben")).toBeTruthy();
    expect(screen.getByText("Couldn't unblock Ben. Please try again.")).toBeTruthy();
  });

  it("says when nobody is blocked", async () => {
    load.mockResolvedValue([]);
    render(<BlockedPlayersList />);
    expect(await screen.findByText(/You haven't blocked anyone/)).toBeTruthy();
  });
});

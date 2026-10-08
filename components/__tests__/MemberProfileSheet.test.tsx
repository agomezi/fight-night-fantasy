import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { blockPlayer, unblockPlayer } from "../../services/blocks";
import { reportMember, loadMemberProfile, type MemberProfile } from "../../services/leagues";
import MemberProfileSheet from "../MemberProfileSheet";

// Animation and presses are stood in for, so these test what shows and what is sent.
// The profile context signs in and stores; only its initials helper is used here.
jest.mock("../../context/ProfileContext", () => ({
  getInitials: (name: string) => name.slice(0, 2).toUpperCase(),
}));
jest.mock("react-native-reanimated", () => {
  const { View } = jest.requireActual("react-native");
  return { __esModule: true, default: { View, createAnimatedComponent: (C: unknown) => C } };
});
jest.mock("../../constants/motion", () => ({ appear: () => undefined }));
jest.mock("../PressableScale", () => {
  const { Pressable } = jest.requireActual("react-native");
  return { __esModule: true, default: Pressable };
});
jest.mock("../../context/ThemeContext", () => {
  const { palettes } = jest.requireActual("../../constants/palette");
  const c = palettes.dark;
  return { useTheme: () => ({ c }), useThemedStyles: (make: (p: unknown) => unknown) => make(c) };
});
jest.mock("../../services/leagues", () => ({
  ...jest.requireActual("../../services/leagues"),
  loadMemberProfile: jest.fn(),
  reportMember: jest.fn(),
}));

jest.mock("../../services/blocks", () => ({ blockPlayer: jest.fn(), unblockPlayer: jest.fn() }));

const load = loadMemberProfile as jest.MockedFunction<typeof loadMemberProfile>;
const block = blockPlayer as jest.MockedFunction<typeof blockPlayer>;
const unblock = unblockPlayer as jest.MockedFunction<typeof unblockPlayer>;
const report = reportMember as jest.MockedFunction<typeof reportMember>;

const ben: MemberProfile = {
  name: "Ben",
  accuracy: 57,
  favoriteDivision: "Lightweight",
  isMe: false,
  canReport: true,
  reported: false,
  blocked: false,
};

beforeEach(() => {
  load.mockReset();
  report.mockReset();
  block.mockReset().mockResolvedValue();
  unblock.mockReset().mockResolvedValue();
});

async function open(profile: MemberProfile | null, onClose = jest.fn()) {
  load.mockResolvedValue(profile);
  render(<MemberProfileSheet leagueId="lg-1" userId="u-ben" onClose={onClose} />);
  await waitFor(() => expect(load).toHaveBeenCalledWith("lg-1", "u-ben"));
  return onClose;
}

describe("MemberProfileSheet", () => {
  it("shows the name, accuracy and favorite division", async () => {
    await open(ben);
    expect(await screen.findByText("Ben")).toBeTruthy();
    expect(screen.getByText("57%")).toBeTruthy();
    expect(screen.getByText("LIGHTWEIGHT")).toBeTruthy();
    expect(screen.getByText("FAVORITE DIVISION")).toBeTruthy();
  });

  it("lays the stats out inside the card, not pinned over the name", async () => {
    await open(ben);
    // Walk up from the figure: nothing between it and the card may be
    // absolutely positioned (the stat row's default, which covered the header).
    let node = (await screen.findByText("57%")).parent;
    while (node) {
      const style = StyleSheet.flatten(node.props.style) ?? {};
      expect(style.position).not.toBe("absolute");
      if (style.borderRadius === 20) break; // the card
      node = node.parent;
    }
    expect(node).not.toBeNull();
  });

  it("lets a long division shrink to fit instead of cutting it off", async () => {
    await open({ ...ben, favoriteDivision: "Light Heavyweight" });
    const value = await screen.findByText("LIGHT HEAVYWEIGHT");
    expect(value.props.adjustsFontSizeToFit).toBe(true);
    expect(screen.getByText("57%").props.adjustsFontSizeToFit).toBeFalsy();
  });

  it("renders nothing while closed", () => {
    render(<MemberProfileSheet leagueId="lg-1" userId={null} onClose={jest.fn()} />);
    expect(screen.queryByText("Close")).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });

  it("closes from the Close button", async () => {
    const onClose = await open(ben);
    fireEvent.press(await screen.findByText("Close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("keeps Report behind the menu", async () => {
    await open(ben);
    await screen.findByText("Ben");
    expect(screen.queryByText("Report")).toBeNull();
    fireEvent.press(screen.getByLabelText("More options"));
    expect(screen.getByText("Report")).toBeTruthy();
  });

  it("sends a report with its reason and note, and confirms it", async () => {
    report.mockResolvedValue(true);
    await open(ben);
    await screen.findByText("Ben");
    fireEvent.press(screen.getByLabelText("More options"));
    fireEvent.press(screen.getByText("Report"));

    // Nothing is sent before a reason is picked.
    fireEvent.press(screen.getByText("SEND REPORT"));
    expect(report).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText("Impersonation"));
    fireEvent.changeText(screen.getByPlaceholderText("Add a note (optional)"), "pretends to be a pro");
    await act(async () => {
      fireEvent.press(screen.getByText("SEND REPORT"));
    });
    expect(report).toHaveBeenCalledWith("lg-1", "u-ben", "impersonation", "pretends to be a pro");
    expect(await screen.findByText("Report sent")).toBeTruthy();
  });

  it("says so when the player was already reported", async () => {
    report.mockResolvedValue(false);
    await open(ben);
    await screen.findByText("Ben");
    fireEvent.press(screen.getByLabelText("More options"));
    fireEvent.press(screen.getByText("Report"));
    fireEvent.press(screen.getByText("Offensive name"));
    await act(async () => {
      fireEvent.press(screen.getByText("SEND REPORT"));
    });
    expect(await screen.findByText("Already reported")).toBeTruthy();
  });

  it("shows a reported player as reported, with nothing more to send", async () => {
    await open({ ...ben, reported: true });
    await screen.findByText("Ben");
    fireEvent.press(screen.getByLabelText("More options"));
    fireEvent.press(screen.getByText("Reported"));
    expect(screen.queryByText("SEND REPORT")).toBeNull();
  });

  it("offers no menu on your own profile", async () => {
    await open({ ...ben, name: "agomezi", isMe: true, canReport: false });
    expect(await screen.findByText("That's you")).toBeTruthy();
    expect(screen.queryByLabelText("More options")).toBeNull();
  });

  it("says when the profile can't be loaded", async () => {
    await open(null);
    expect(await screen.findByText("Couldn't load this profile.")).toBeTruthy();
  });

  it("shows the report error and keeps the form open", async () => {
    report.mockRejectedValue(new Error("You can only report players in your leagues."));
    await open(ben);
    await screen.findByText("Ben");
    fireEvent.press(screen.getByLabelText("More options"));
    fireEvent.press(screen.getByText("Report"));
    fireEvent.press(screen.getByText("Something else"));
    await act(async () => {
      fireEvent.press(screen.getByText("SEND REPORT"));
    });
    expect(await screen.findByText("You can only report players in your leagues.")).toBeTruthy();
    expect(screen.getByText("SEND REPORT")).toBeTruthy();
  });

  describe("blocking", () => {
    it("confirms before blocking, then says what it did", async () => {
      await open(ben);
      await screen.findByText("Ben");
      fireEvent.press(screen.getByLabelText("More options"));
      fireEvent.press(screen.getByText("Block"));
      expect(screen.getByText("Block Ben?")).toBeTruthy();
      expect(block).not.toHaveBeenCalled();

      await act(async () => {
        fireEvent.press(screen.getByText("BLOCK"));
      });
      expect(block).toHaveBeenCalledWith("u-ben");
      expect(await screen.findByText("Blocked")).toBeTruthy();
      expect(screen.getByText(/You can unblock them in Settings/)).toBeTruthy();
    });

    it("can block and report in one go, still naming the player", async () => {
      await open(ben);
      await screen.findByText("Ben");
      fireEvent.press(screen.getByLabelText("More options"));
      fireEvent.press(screen.getByText("Block"));
      await act(async () => {
        fireEvent.press(screen.getByText("Block and report"));
      });
      expect(block).toHaveBeenCalledWith("u-ben");
      expect(screen.getByText("Report Ben")).toBeTruthy();
    });

    it("doesn't offer to report again with the block", async () => {
      await open({ ...ben, reported: true });
      await screen.findByText("Ben");
      fireEvent.press(screen.getByLabelText("More options"));
      fireEvent.press(screen.getByText("Block"));
      expect(screen.queryByText("Block and report")).toBeNull();
    });

    it("can be cancelled", async () => {
      await open(ben);
      await screen.findByText("Ben");
      fireEvent.press(screen.getByLabelText("More options"));
      fireEvent.press(screen.getByText("Block"));
      fireEvent.press(screen.getByText("Cancel"));
      expect(screen.queryByText("Block Ben?")).toBeNull();
      expect(block).not.toHaveBeenCalled();
    });

    it("offers only Unblock on a blocked player, and unblocking shows their name again", async () => {
      await open({ ...ben, name: "Blocked player", blocked: true });
      await screen.findByText("Blocked player");
      fireEvent.press(screen.getByLabelText("More options"));
      expect(screen.queryByText("Report")).toBeNull();
      expect(screen.queryByText("Block")).toBeNull();

      load.mockResolvedValue(ben);
      await act(async () => {
        fireEvent.press(screen.getByText("Unblock"));
      });
      expect(unblock).toHaveBeenCalledWith("u-ben");
      expect(await screen.findByText("Ben")).toBeTruthy();
    });
  });
});

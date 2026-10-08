import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import {
  loadCase,
  loadHistory,
  loadQueue,
  moderate,
  type CaseDetail,
  type QueueItem,
} from "../../services/moderation";
import ModerationCase from "../ModerationCase";
import ModerationQueue from "../ModerationQueue";

// Animation and presses are stood in for, so these test what shows and what is sent.
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
jest.mock("../../services/moderation", () => ({
  ...jest.requireActual("../../services/moderation"),
  loadQueue: jest.fn(),
  loadHistory: jest.fn(),
  loadCase: jest.fn(),
  moderate: jest.fn(),
}));

const queue = loadQueue as jest.MockedFunction<typeof loadQueue>;
const history = loadHistory as jest.MockedFunction<typeof loadHistory>;
const one = loadCase as jest.MockedFunction<typeof loadCase>;
const act = moderate as jest.MockedFunction<typeof moderate>;

const cal: QueueItem = {
  caseId: 12,
  player: "u-cal",
  name: "Cal",
  reporters: 3,
  reasons: ["impersonation", "offensive name"],
  openedAt: new Date(Date.now() - 2 * 3600_000),
  strikes: 1,
  standing: "active",
  protected: false,
};

const detail: CaseDetail = {
  id: 12,
  status: "open",
  openedAt: new Date("2026-10-08T00:00:00Z"),
  resolvedAt: null,
  player: { id: "u-cal", name: "Cal", pastNames: ["Calvin"], standing: "active", until: null, strikes: 1, protected: false },
  reports: [
    {
      id: 1, reportedName: "Cal", reason: "offensive name", note: "Rude", league: "Gym League", reporter: "Ana",
      reporterEstablished: false, at: new Date("2026-10-08T00:00:00Z"),
    },
  ],
  actions: [
    {
      id: 5, caseId: 9, action: "warn", reason: "Offensive name", note: null, expiresAt: null, moderator: "Moe",
      at: new Date("2026-09-01T00:00:00Z"),
    },
  ],
};

beforeEach(() => {
  queue.mockReset();
  history.mockReset();
  one.mockReset();
  act.mockReset();
});

describe("ModerationQueue", () => {
  it("lists open cases with reporters, reasons and strikes, and opens one", async () => {
    queue.mockResolvedValue([cal]);
    history.mockResolvedValue([]);
    const onOpen = jest.fn();
    render(<ModerationQueue onOpenCase={onOpen} />);

    expect(await screen.findByText("Cal")).toBeTruthy();
    expect(screen.getByText("Queue (1)")).toBeTruthy();
    expect(screen.getByText("3 reporters · open 2h · 1 strike")).toBeTruthy();
    expect(screen.getByText("impersonation")).toBeTruthy();
    expect(screen.getByText("offensive name")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Case 12: Cal"));
    expect(onOpen).toHaveBeenCalledWith(12);
  });

  it("says when the queue is clear, and shows the history", async () => {
    queue.mockResolvedValue([]);
    history.mockResolvedValue([
      {
        actionId: 3, caseId: 12, playerName: null, action: "reset_name", reason: "Offensive name", note: "first",
        expiresAt: null, moderator: null, at: new Date("2026-10-08T00:00:00Z"),
      },
    ]);
    render(<ModerationQueue onOpenCase={jest.fn()} />);
    expect(await screen.findByText("No open cases. All clear.")).toBeTruthy();

    fireEvent.press(screen.getByText("History"));
    expect(screen.getByText("Name reset · (no name)")).toBeTruthy();
    expect(screen.getByText("Reason: Offensive name")).toBeTruthy();
    expect(screen.getByText(/^SQL editor · /)).toBeTruthy();
  });

  it("shows why it couldn't load", async () => {
    queue.mockRejectedValue(new Error("Only moderators can do that."));
    history.mockResolvedValue([]);
    render(<ModerationQueue onOpenCase={jest.fn()} />);
    expect(await screen.findByText("Only moderators can do that.")).toBeTruthy();
  });
});

describe("ModerationCase", () => {
  it("shows the player, reports, past actions and the suggested step", async () => {
    one.mockResolvedValue(detail);
    render(<ModerationCase caseId={12} onDone={jest.fn()} />);

    expect(await screen.findByText("Cal")).toBeTruthy();
    expect(one).toHaveBeenCalledWith(12);
    expect(screen.getByText(/Calvin/)).toBeTruthy();
    expect(screen.getByText(/Reset the name and suspend for 7 days/)).toBeTruthy();
    expect(screen.getByText(/Ana \(new account\)/)).toBeTruthy();
    expect(screen.getByText("Warned")).toBeTruthy();
    // Nothing to lift on an active player.
    expect(screen.queryByText("Lift")).toBeNull();
  });

  it("confirms before acting, and sends the reason, note and length", async () => {
    one.mockResolvedValue(detail);
    act.mockResolvedValue();
    const onDone = jest.fn();
    render(<ModerationCase caseId={12} onDone={onDone} />);
    await screen.findByText("Cal");

    fireEvent.press(screen.getByText("Suspend"));
    expect(screen.getByText("Suspend Cal?")).toBeTruthy();
    expect(act).not.toHaveBeenCalled();

    expect(screen.getByLabelText("Reason").props.value).toBe("Offensive name");
    fireEvent.press(screen.getByText("30 days"));
    fireEvent.changeText(screen.getByLabelText("Note"), "second strike");
    fireEvent.press(screen.getByText("CONFIRM SUSPEND"));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(act).toHaveBeenCalledWith(12, "suspend", { reason: "Offensive name", note: "second strike", days: 30 });
  });

  it("can be cancelled", async () => {
    one.mockResolvedValue(detail);
    render(<ModerationCase caseId={12} onDone={jest.fn()} />);
    await screen.findByText("Cal");

    fireEvent.press(screen.getByText("Ban"));
    expect(screen.getByText("Ban Cal?")).toBeTruthy();
    fireEvent.press(screen.getByText("Cancel"));
    expect(screen.queryByText("Ban Cal?")).toBeNull();
    expect(act).not.toHaveBeenCalled();
  });

  it("keeps the dialog open and shows the server's refusal", async () => {
    one.mockResolvedValue(detail);
    act.mockRejectedValue(new Error("Case 12 is already closed."));
    const onDone = jest.fn();
    render(<ModerationCase caseId={12} onDone={onDone} />);
    await screen.findByText("Cal");

    fireEvent.press(screen.getByText("Dismiss"));
    expect(screen.queryByLabelText("Reason")).toBeNull();
    fireEvent.press(screen.getByText("CONFIRM DISMISS"));
    expect(await screen.findByText("Case 12 is already closed.")).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("offers lift to a suspended player", async () => {
    one.mockResolvedValue({ ...detail, status: "actioned", player: { ...detail.player, standing: "suspended", until: new Date("2026-10-15T00:00:00Z") } });
    render(<ModerationCase caseId={12} onDone={jest.fn()} />);
    await screen.findByText("Cal");
    expect(screen.queryByText("Dismiss")).toBeNull();
    fireEvent.press(screen.getByText("Lift"));
    expect(screen.getByText("Lift the suspension?")).toBeTruthy();
  });
});

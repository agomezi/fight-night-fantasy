import { act, render, screen, waitFor } from "@testing-library/react-native";
import { Alert, AppState, Text } from "react-native";
import { loadStanding } from "../../services/standing";
import { StandingProvider, useStanding } from "../StandingContext";

const mockSignOut = jest.fn();
let mockSession: { user: { id: string } } | null = { user: { id: "u-1" } };

jest.mock("../AuthContext", () => ({ useAuth: () => ({ session: mockSession, signOut: mockSignOut }) }));
jest.mock("../../services/supabase", () => ({ supabase: { auth: { signOut: jest.fn().mockResolvedValue({}) } } }));
jest.mock("../../services/standing", () => ({
  ...jest.requireActual("../../services/standing"),
  loadStanding: jest.fn(),
}));

const load = loadStanding as jest.MockedFunction<typeof loadStanding>;

function Show() {
  const s = useStanding();
  return <Text>{s.standing}</Text>;
}

let foreground: ((state: string) => void) | undefined;
beforeEach(() => {
  mockSession = { user: { id: "u-1" } };
  mockSignOut.mockReset().mockResolvedValue(undefined);
  load.mockReset();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
  jest.spyOn(AppState, "addEventListener").mockImplementation((_type, fn) => {
    foreground = fn as (state: string) => void;
    return { remove: jest.fn() } as never;
  });
});

describe("StandingProvider", () => {
  it("reads the player's standing at launch", async () => {
    load.mockResolvedValue({ standing: "suspended", until: new Date("2026-10-15T00:00:00Z") });
    render(<StandingProvider><Show /></StandingProvider>);
    expect(await screen.findByText("suspended")).toBeTruthy();
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("signs a banned player out and tells them why", async () => {
    load.mockResolvedValue({ standing: "banned", until: null });
    render(<StandingProvider><Show /></StandingProvider>);
    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
    expect(Alert.alert).toHaveBeenCalledWith("Account banned", expect.stringContaining("banned"));
  });

  it("checks again when the app comes back to the foreground", async () => {
    load.mockResolvedValueOnce({ standing: "active", until: null }).mockResolvedValueOnce({ standing: "banned", until: null });
    render(<StandingProvider><Show /></StandingProvider>);
    await screen.findByText("active");
    await act(async () => foreground?.("active"));
    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("keeps what it knew when offline", async () => {
    load.mockRejectedValue(new Error("Network request failed"));
    render(<StandingProvider><Show /></StandingProvider>);
    await waitFor(() => expect(load).toHaveBeenCalled());
    expect(screen.getByText("active")).toBeTruthy();
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("checks nothing when signed out", () => {
    mockSession = null;
    render(<StandingProvider><Show /></StandingProvider>);
    expect(load).not.toHaveBeenCalled();
  });
});

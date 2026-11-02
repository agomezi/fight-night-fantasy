import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { holdModal, modalsFree } from "../../services/modalGate";
import { HandleBlockedError } from "../../services/profile";
import NameRemovedSheet from "../NameRemovedSheet";

jest.mock("../PressableScale", () => {
  const { Pressable } = jest.requireActual("react-native");
  return { __esModule: true, default: Pressable };
});
jest.mock("../../context/ThemeContext", () => {
  const { palettes } = jest.requireActual("../../constants/palette");
  const c = palettes.dark;
  return { useTheme: () => ({ c }), useThemedStyles: (make: (p: unknown) => unknown) => make(c) };
});
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

describe("NameRemovedSheet", () => {
  it("says the name was removed and warns about a ban", () => {
    render(<NameRemovedSheet removed onSave={jest.fn()} />);
    expect(screen.getByText("Pick a new username")).toBeTruthy();
    expect(screen.getByText(/broke our name rules/)).toBeTruthy();
    expect(screen.getByText("Repeated offensive names will get your account banned.")).toBeTruthy();
  });

  it("has no way to skip it", () => {
    render(<NameRemovedSheet removed onSave={jest.fn()} />);
    expect(screen.queryByText(/later|skip|not now|keep it/i)).toBeNull();
  });

  it("cleans the name as it's typed and saves it", async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    render(<NameRemovedSheet removed onSave={onSave} />);
    fireEvent.changeText(screen.getByPlaceholderText("New username"), "Kilo Two!");
    fireEvent.press(screen.getByText("SAVE NAME"));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith("Kilo_Two"));
  });

  it("won't save a name that breaks the rules", () => {
    const onSave = jest.fn();
    render(<NameRemovedSheet removed onSave={onSave} />);
    fireEvent.changeText(screen.getByPlaceholderText("New username"), "ab");
    expect(screen.getByText("At least 3 characters.")).toBeTruthy();
    fireEvent.press(screen.getByText("SAVE NAME"));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("says why a save was refused", async () => {
    const onSave = jest.fn().mockRejectedValue(new HandleBlockedError());
    render(<NameRemovedSheet removed onSave={onSave} />);
    fireEvent.changeText(screen.getByPlaceholderText("New username"), "Another_One");
    fireEvent.press(screen.getByText("SAVE NAME"));
    expect(await screen.findByText("That name isn't allowed. Pick another one.")).toBeTruthy();
  });

  it("waits for another open card, then holds the gate until the name is replaced", () => {
    const other = holdModal();
    const { rerender } = render(<NameRemovedSheet removed onSave={jest.fn()} />);
    expect(screen.queryByText("Pick a new username")).toBeNull();
    act(() => other());
    expect(screen.getByText("Pick a new username")).toBeTruthy();
    expect(modalsFree()).toBe(false);
    rerender(<NameRemovedSheet removed={false} onSave={jest.fn()} />);
    expect(modalsFree()).toBe(true);
  });
});

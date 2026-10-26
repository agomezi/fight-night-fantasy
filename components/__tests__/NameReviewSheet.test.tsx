import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { HandleTakenError } from "../../services/profile";
import NameReviewSheet from "../NameReviewSheet";

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

function setup(onRename = jest.fn().mockResolvedValue(undefined)) {
  const onSkip = jest.fn();
  render(<NameReviewSheet visible alias={4821} currentName="Kilo" onRename={onRename} onSkip={onSkip} />);
  return { onRename, onSkip };
}

describe("NameReviewSheet", () => {
  it("shows the tag others see", () => {
    setup();
    expect(screen.getByText(/others see you as Player #4821/)).toBeTruthy();
  });

  it("cleans the name as it's typed and saves it", async () => {
    const { onRename } = setup();
    fireEvent.changeText(screen.getByPlaceholderText("New username"), "Kilo Two!");
    fireEvent.press(screen.getByText("CHANGE NAME"));
    await waitFor(() => expect(onRename).toHaveBeenCalledWith("Kilo_Two"));
  });

  it("won't save a name that breaks the rules or is the same one", () => {
    const { onRename } = setup();
    fireEvent.changeText(screen.getByPlaceholderText("New username"), "ab");
    expect(screen.getByText("At least 3 characters.")).toBeTruthy();
    fireEvent.press(screen.getByText("CHANGE NAME"));
    fireEvent.changeText(screen.getByPlaceholderText("New username"), "KILO");
    fireEvent.press(screen.getByText("CHANGE NAME"));
    expect(onRename).not.toHaveBeenCalled();
  });

  it("says why a rename didn't go through", async () => {
    setup(jest.fn().mockRejectedValue(new HandleTakenError()));
    fireEvent.changeText(screen.getByPlaceholderText("New username"), "Kilo_Two");
    fireEvent.press(screen.getByText("CHANGE NAME"));
    expect(await screen.findByText("That name is taken. Try another one.")).toBeTruthy();
  });

  it("can be put off", () => {
    const { onSkip } = setup();
    fireEvent.press(screen.getByText("Keep it for now"));
    expect(onSkip).toHaveBeenCalled();
  });
});

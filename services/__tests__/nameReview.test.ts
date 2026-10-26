import { HandleBlockedError, HandleTakenError, HandleTooSoonError } from "../profile";
import { hiddenTag, nameReviewCopy, renameErrorMessage, shouldOfferRename } from "../nameReview";

describe("name review", () => {
  it("names the tag others see", () => {
    expect(hiddenTag(4821)).toBe("Player #4821");
    expect(hiddenTag(null)).toBe("Player");
  });

  it("explains the review and offers a rename that can be put off", () => {
    expect(nameReviewCopy(4821)).toEqual({
      eyebrow: "NAME UNDER REVIEW",
      title: "Your name is under review",
      body: "A few players reported it, so others see you as Player #4821. Pick a new name now and everyone sees it straight away. If a moderator finds your old name was fine, you'll get it back.",
      action: "CHANGE NAME",
      skip: "Keep it for now",
    });
  });

  it("offers the rename only while hidden, not yet renamed, and not put off for this case", () => {
    const hidden = { hidden: true, alias: 4821, renamed: false };
    expect(shouldOfferRename(hidden, null)).toBe(true);
    expect(shouldOfferRename(hidden, 4821)).toBe(false);
    // Put off for an earlier case: a new case asks again.
    expect(shouldOfferRename(hidden, 1234)).toBe(true);
    expect(shouldOfferRename({ ...hidden, renamed: true }, null)).toBe(false);
    expect(shouldOfferRename({ ...hidden, hidden: false }, null)).toBe(false);
    expect(shouldOfferRename(null, null)).toBe(false);
  });

  it("explains a rename that didn't go through", () => {
    expect(renameErrorMessage(new HandleTakenError())).toBe("That name is taken. Try another one.");
    expect(renameErrorMessage(new HandleBlockedError())).toBe("That name isn't allowed. Pick another one.");
    expect(renameErrorMessage(new HandleTooSoonError(null))).toBe("You've already changed your name this week.");
    expect(renameErrorMessage(new Error("Network down"))).toBe("Network down");
  });
});

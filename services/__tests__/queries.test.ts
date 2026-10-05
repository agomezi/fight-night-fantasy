import { EVENT_DETAIL_QUERY } from "../eventDetail";
import { NEXT_EVENT_QUERY } from "../events";
import { HISTORY_PICKS_QUERY } from "../history";

// events and bouts are linked twice (bouts.event_id and events.live_bout_id),
// so an embed between them that does not name its foreign key is ambiguous
// and the database refuses the whole query.
describe("event and bout embeds", () => {
  test.each([
    ["NEXT_EVENT_QUERY", NEXT_EVENT_QUERY],
    ["EVENT_DETAIL_QUERY", EVENT_DETAIL_QUERY],
    ["HISTORY_PICKS_QUERY", HISTORY_PICKS_QUERY],
  ])("%s names the card's foreign key", (_, query) => {
    const embeds = query.match(/\b(bouts|events)(![a-z_]+)*\s*\(/g) ?? [];
    expect(embeds.length).toBeGreaterThan(0);
    for (const embed of embeds) {
      if (/^bouts!inner/.test(embed)) continue; // picks → bouts has one link
      expect(embed).toContain("!bouts_event_id_fkey");
    }
  });
});

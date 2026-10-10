import { fightRowsFromCsv, parseCsv, summarizeHistory } from "../fightHistory";

const csv = [
  "Fight_URL,Fighter_1,Fighter_2,Winner,Weight_Class,Method,Event_Date",
  "u1,Ana Silva,Bea Costa,Ana Silva,Flyweight,KO/TKO,2024-01-01",
  "u2,Ana Silva,Cat Lee,Cat Lee,Flyweight,Decision - Unanimous,2024-06-01",
  "u3,Dee Park,Ana Silva,Ana Silva,Flyweight,Submission,2025-01-01",
  `u4,"Silva, Ana",Eve Ruiz,Eve Ruiz,Flyweight,Decision - Split,2025-02-01`,
  "u5,Ana Silva,Fay Wu,Draw/NC,Flyweight,Overturned,2025-03-01",
  "u6,Ana Silva,Gia Moe,Ana Silva,Flyweight,TKO - Doctor's Stoppage,2025-06-01",
  "u7,Ana Silva,Hal Ito,Ana Silva,Flyweight,Decision - Majority,2025-09-01",
  "u8,Bea Costa,Cat Lee,Draw/NC,Flyweight,Decision - Split,2025-09-01",
].join("\r\n");

const byName = (name: string) => summarizeHistory(fightRowsFromCsv(csv)).find((h) => h.name === name);

test("wins by method, losses and the streak, from either corner", () => {
  expect(byName("Ana Silva")).toEqual({
    name: "Ana Silva",
    wins: 4,
    losses: 1,
    koWins: 2, // a doctor's stoppage is a TKO
    subWins: 1,
    decWins: 1,
    winStreak: 3, // the overturned fight neither counts nor ends it
    lastFight: "2025-09-01",
  });
});

test("a draw ends a streak", () => {
  expect(byName("Cat Lee")).toMatchObject({ wins: 1, losses: 0, winStreak: 0 });
});

test("quoted fields keep their commas", () => {
  expect(parseCsv(csv)[3].Fighter_1).toBe("Silva, Ana");
  expect(byName("Silva, Ana")).toMatchObject({ wins: 0, losses: 1 });
});

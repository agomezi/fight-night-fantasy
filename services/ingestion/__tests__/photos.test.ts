import { apiPairs, matchByName, matchPhotos, nameKey, sameFighter, searchTerm } from "../photos";

// Hand-built responses in the shape of API-Sports' `fights?date=` endpoint.
const fighter = (id: number, name: string, logo: unknown = `https://media.api-sports.io/mma/fighters/${id}.png`) => ({ id, name, logo });
const response = (...fights: [unknown, unknown][]) => ({
  errors: [],
  response: fights.map(([first, second], i) => ({ id: 900 + i, fighters: { first, second } })),
});
const bout = (red: string, blue: string) => ({
  red: { ufcFighterId: `u-${red}`, name: red },
  blue: { ufcFighterId: `u-${blue}`, name: blue },
});

describe("names", () => {
  test.each([
    ["José Aldo", "jose aldo"],
    ["Raul Rosas Jr.", "raul rosas"],
    ["Jan Błachowicz", "jan blachowicz"],
    ["Søren Bak", "soren bak"],
    ["Da'Mon Blackshear", "damon blackshear"],
    ["Jean-Silva", "jean silva"],
  ])("%s keys as %s", (name, key) => expect(nameKey(name)).toBe(key));

  test("same person across spellings", () => {
    expect(sameFighter("Alex Pereira", "Alexandre Pereira")).toBe(true);
    expect(sameFighter("Jose Aldo", "José Aldo")).toBe(true);
    expect(sameFighter("Raul Rosas Jr.", "Raul Rosas")).toBe(true);
    expect(sameFighter("Jan Błachowicz", "Jan Blachowicz")).toBe(true);
    expect(sameFighter("Da'Mon Blackshear", "DaMon Blackshear")).toBe(true);
  });
  test("different people sharing a surname", () => {
    expect(sameFighter("Natalia Silva", "Bruno Silva")).toBe(false);
    expect(sameFighter("Silva", "Natalia Silva")).toBe(false);
  });
});

describe("matchPhotos", () => {
  test("matches both fighters of a bout, whichever way round the API lists them", () => {
    const matches = matchPhotos(
      [bout("Natalia Silva", "Wang Cong"), bout("Deiveson Figueiredo", "Payton Talbott")],
      response(
        [fighter(11, "Natalia Silva"), fighter(12, "Wang Cong")],
        [fighter(22, "Payton Talbott"), fighter(21, "Deiveson Figueiredo")],
      ),
    );
    expect(matches).toEqual([
      { ufcFighterId: "u-Natalia Silva", apisportsFighterId: 11, photoUrl: "https://media.api-sports.io/mma/fighters/11.png" },
      { ufcFighterId: "u-Wang Cong", apisportsFighterId: 12, photoUrl: "https://media.api-sports.io/mma/fighters/12.png" },
      { ufcFighterId: "u-Deiveson Figueiredo", apisportsFighterId: 21, photoUrl: "https://media.api-sports.io/mma/fighters/21.png" },
      { ufcFighterId: "u-Payton Talbott", apisportsFighterId: 22, photoUrl: "https://media.api-sports.io/mma/fighters/22.png" },
    ]);
  });

  test("one fighter matching is not enough", () => {
    // A late replacement: the API still lists the old opponent.
    expect(matchPhotos([bout("Natalia Silva", "Wang Cong")], response([fighter(11, "Natalia Silva"), fighter(13, "Someone Else")]))).toEqual([]);
  });

  test("a surname shared across the card cannot cross bouts", () => {
    const matches = matchPhotos(
      [bout("Natalia Silva", "Wang Cong")],
      response([fighter(31, "Bruno Silva"), fighter(32, "Wang Cong")]),
    );
    expect(matches).toEqual([]);
  });

  test("an ambiguous bout is skipped rather than guessed", () => {
    const pair: [unknown, unknown] = [fighter(11, "Natalia Silva"), fighter(12, "Wang Cong")];
    expect(matchPhotos([bout("Natalia Silva", "Wang Cong")], response(pair, [fighter(41, "Natalia Silva"), fighter(42, "Wang Cong")]))).toEqual([]);
  });

  test("a fighter without an https photo gets no match, the opponent still does", () => {
    const matches = matchPhotos(
      [bout("Natalia Silva", "Wang Cong")],
      response([fighter(11, "Natalia Silva", null), fighter(12, "Wang Cong", "http://insecure.example/12.png")]),
    );
    expect(matches).toEqual([]);
    const one = matchPhotos([bout("Natalia Silva", "Wang Cong")], response([fighter(11, "Natalia Silva", null), fighter(12, "Wang Cong")]));
    expect(one.map((m) => m.apisportsFighterId)).toEqual([12]);
  });

  test("accepts photo under `photo` as well as `logo`", () => {
    const matches = matchPhotos(
      [bout("Natalia Silva", "Wang Cong")],
      response([{ id: 11, name: "Natalia Silva", photo: "https://media.api-sports.io/a.png" }, fighter(12, "Wang Cong")]),
    );
    expect(matches.map((m) => m.photoUrl)).toEqual(["https://media.api-sports.io/a.png", "https://media.api-sports.io/mma/fighters/12.png"]);
  });

  test("errors, empty and malformed responses match nothing", () => {
    expect(apiPairs({ errors: { token: "invalid" }, response: [] })).toEqual([]);
    expect(apiPairs(null)).toEqual([]);
    expect(apiPairs({ response: [{ fighters: { first: { id: "x", name: 1 } } }] })).toEqual([]);
  });
});

describe("matchByName (fallback)", () => {
  const card = (name: string, weightClass: string | null = "Lightweight") => ({ ufcFighterId: `u-${name}`, name, weightClass });
  const found = (...fighters: object[]) => ({ errors: [], response: fighters });
  const api = (id: number, name: string, category = "Lightweight") => ({ id, name, category, photo: `https://media.api-sports.io/mma/fighters/${id}.png` });

  test("one fighter with the exact name is matched", () => {
    expect(matchByName(card("Esteban Ribovics"), found(api(7, "Esteban Ribovics"), api(8, "Someone Ribovics")))).toEqual({
      ufcFighterId: "u-Esteban Ribovics", apisportsFighterId: 7, photoUrl: "https://media.api-sports.io/mma/fighters/7.png",
    });
  });
  test("accents and suffixes do not stop a match", () => {
    expect(matchByName(card("Raul Rosas Jr."), found(api(9, "Raúl Rosas")))?.apisportsFighterId).toBe(9);
  });
  test("no first-initial leeway without an opponent to confirm it", () => {
    expect(matchByName(card("Alex Pereira"), found(api(1, "Alexandre Pereira")))).toBeNull();
  });
  test("two fighters with one name are told apart by weight class", () => {
    const twoBrunos = found(api(21, "Bruno Silva", "Middleweight"), api(22, "Bruno Silva", "Flyweight"));
    expect(matchByName(card("Bruno Silva", "Flyweight"), twoBrunos)?.apisportsFighterId).toBe(22);
  });
  test("and skipped when weight class cannot tell them apart", () => {
    const twoBrunos = found(api(21, "Bruno Silva", "Flyweight"), api(22, "Bruno Silva", "Flyweight"));
    expect(matchByName(card("Bruno Silva", "Flyweight"), twoBrunos)).toBeNull();
    expect(matchByName(card("Bruno Silva", null), twoBrunos)).toBeNull();
  });
  test("women's divisions compare despite the apostrophe", () => {
    const two = found(api(31, "Ana Silva", "Women's Flyweight"), api(32, "Ana Silva", "Bantamweight"));
    expect(matchByName(card("Ana Silva", "Women's Flyweight"), two)?.apisportsFighterId).toBe(31);
  });
  test("a single-word name is never matched by name alone", () => {
    expect(matchByName(card("Mizuki"), found(api(41, "Mizuki")))).toBeNull();
  });
  test("a match without an https photo is no match", () => {
    expect(matchByName(card("Esteban Ribovics"), found({ id: 7, name: "Esteban Ribovics", photo: null }))).toBeNull();
  });
  test("errors and junk match nothing", () => {
    expect(matchByName(card("Esteban Ribovics"), { errors: { plan: "x" }, response: [] })).toBeNull();
    expect(matchByName(card("Esteban Ribovics"), null)).toBeNull();
  });
});

describe("searchTerm", () => {
  test.each([
    ["Esteban Ribovics", "ribovics"],
    ["Raul Rosas Jr.", "rosas"],
    ["José Aldo", "aldo"],
    ["Wang Cong", "cong"],
    ["Da Un Jung", "jung"],
    ["Li Jingliang", "jingliang"],
    ["Yi Ma", "ma"],
  ])("%s searches %s", (name, term) => {
    expect(searchTerm(name)).toBe(term.length >= 3 ? term : null);
  });
});

// The UFC's current weight classes, heaviest last, as a player can pick one
// for their profile. Women's divisions carry the prefix UFC uses for them.

export const DIVISIONS = {
  men: [
    "Flyweight",
    "Bantamweight",
    "Featherweight",
    "Lightweight",
    "Welterweight",
    "Middleweight",
    "Light Heavyweight",
    "Heavyweight",
  ],
  women: ["Women's Strawweight", "Women's Flyweight", "Women's Bantamweight", "Women's Featherweight"],
} as const;

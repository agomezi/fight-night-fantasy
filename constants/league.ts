export type Standing = {
  id: string;
  rank: number;
  name: string;
  team: string;
  points: number;
  move: number; // positive = climbed, negative = dropped, 0 = held
  isMe?: boolean;
};

export const LEAGUE = {
  name: "The Alpha League",
  kind: "PRIVATE LEAGUE",
  members: 12,
  week: 7,
};

export const SEASON_STANDINGS: Standing[] = [
  { id: "me", rank: 1, name: "You", team: "Team Apex", points: 1245.5, move: 1, isMe: true },
  { id: "dave", rank: 2, name: "Dave M.", team: "Striker Squad", points: 1235.0, move: 1 },
  { id: "sarah", rank: 3, name: "Sarah J.", team: "Submission Artists", points: 1102.5, move: 0 },
  { id: "mike", rank: 4, name: "Mike K.", team: "Knockout Kings", points: 980.0, move: 2 },
  { id: "priya", rank: 5, name: "Priya K.", team: "Ground Control", points: 905.0, move: -1 },
  { id: "jordan", rank: 6, name: "Jordan M.", team: "The Octagon", points: 871.5, move: 1 },
  { id: "deshawn", rank: 7, name: "Deshawn T.", team: "Clinch Club", points: 812.0, move: -2 },
  { id: "sofia", rank: 8, name: "Sofia R.", team: "Heavy Hitters", points: 768.5, move: 0 },
];

export const EVENT_STANDINGS: Standing[] = [
  { id: "dave", rank: 1, name: "Dave M.", team: "Striker Squad", points: 245.0, move: 3 },
  { id: "sofia", rank: 2, name: "Sofia R.", team: "Heavy Hitters", points: 238.0, move: -1 },
  { id: "deshawn", rank: 3, name: "Deshawn T.", team: "Clinch Club", points: 231.0, move: 0 },
  { id: "me", rank: 4, name: "You", team: "Team Apex", points: 219.0, move: 2, isMe: true },
  { id: "priya", rank: 5, name: "Priya K.", team: "Ground Control", points: 205.0, move: -2 },
  { id: "jordan", rank: 6, name: "Jordan M.", team: "The Octagon", points: 198.0, move: 1 },
  { id: "sarah", rank: 7, name: "Sarah J.", team: "Submission Artists", points: 181.5, move: -1 },
  { id: "mike", rank: 8, name: "Mike K.", team: "Knockout Kings", points: 164.0, move: 0 },
];

export const RIVALRY = {
  you: { name: "You", proj: 142.0 },
  rival: { name: "Dave", proj: 138.5 },
  gap: 10.5,
};

export const RISING_STARS = [
  { id: "1", name: "ApexPredator", sub: "Moved up 12 spots", delta: "+42%" },
  { id: "2", name: "IronChin88", sub: "Moved up 5 spots", delta: "+18%" },
];

export const CHATTER = [
  { id: "1", author: "Dave M.", time: "2h ago", text: "I need a massive night from my main event pick to catch up. 🥊" },
  { id: "2", author: "Sarah J.", time: "5h ago", text: "Who else is fading the favorite tonight? Seems like a trap." },
];

export const LEAGUE_STATS = [
  { id: "winrate", label: "YOUR WIN RATE", value: "75.0%", delta: "+2.4%", positive: true },
  { id: "avg", label: "POINTS AVERAGE", value: "285", delta: "Stable", positive: null as boolean | null },
  { id: "accuracy", label: "PICK ACCURACY", value: "68%", delta: "-1.2%", positive: false },
  { id: "percentile", label: "LEAGUE PERCENTILE", value: "TOP 3%", delta: "Rising", positive: true },
];

// A user's call on one bout. Dependency-free so scoring can run on the server
// under Deno as well as in the app.

export type Corner = "red" | "blue";
export type Method = "KO" | "SUB";
/**
 * How the fight ends:
 *   number — inside the distance, in that round
 *   "ANY"  — inside the distance, round not called
 *   "DEC"  — goes to the judges
 *
 * "ANY" exists because calling the method is a different confidence level from
 * calling the round. Plenty of picks are "he gets finished" without a view on
 * when, and forcing a round on those makes people guess.
 */
export type Finish = number | "DEC" | "ANY";

export type LanePick = {
  corner: Corner;
  finish: Finish;
  /**
   * Optional on purpose. "Pereira to win" is a complete pick; method and round
   * are refinements on top of it, and each can be given independently.
   */
  method?: Method;
};

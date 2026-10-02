import {
  POINTS,
  UNDERDOG_MULTIPLIER,
  deductionsFor,
  type Tier,
} from "../services/scoring";
import { ScoreRow, Scorecard } from "./Scorecard";

/*
 * The rulebook as the user sees it. Every figure comes from services/scoring,
 * so the published table and the engine that scores picks cannot disagree.
 * Earnings sit in the value column; the deduction for getting that call wrong
 * is the note beside it, so both are visible before anyone picks.
 */
export default function ScoringRules({ tier = "pro" }: { tier?: Tier }) {
  const d = deductionsFor(tier);

  return (
    <Scorecard>
      <ScoreRow index={0} label="Fighter" value={`+${POINTS.fighter}`} note={`−${d.fighter}`} noteTone="down" />
      <ScoreRow index={1} label="Method" value={`+${POINTS.method}`} note={`−${d.method}`} noteTone="down" />
      <ScoreRow index={2} label="Round" value={`+${POINTS.round}`} note={`−${d.round}`} noteTone="down" />
      <ScoreRow index={3} label="Method & round, wrong fighter" value="½" />
      <ScoreRow index={4} label="Main card underdog" value={`${UNDERDOG_MULTIPLIER}x`} />
      <ScoreRow index={5} label="Calls you didn't make" value="0" last />
    </Scorecard>
  );
}

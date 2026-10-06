import { CARD_ART } from "../../../constants/cardArt";
import GloveFlat from "./GloveFlat";
import GloveLine from "./GloveLine";

/** The glove mark. Which drawing it uses is set by CARD_ART.flatGlove. */
const Glove = CARD_ART.flatGlove ? GloveFlat : GloveLine;

export default Glove;

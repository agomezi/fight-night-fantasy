/**
 * Every hand-drawn SVG in the app.
 *
 * Two kinds live under here, and the split is by job rather than by subject:
 *
 *   icons/ — small functional shapes, tapped or scanned at 22–36px. Nav tabs,
 *            header controls. They have to survive being tiny.
 *   marks/ — large identity graphics at 74px+, sat faintly behind card content
 *            (see CardMark) to say what kind of card you're looking at.
 *
 * A shape can appear in both roles — the octagon is the home tab icon and the
 * mark on the all-time card — which is why marks are built on one shared 80×80
 * grid with a tunable strokeWidth instead of being baked at a single size.
 *
 * Import from the subfolder you mean (`svg/marks`, `svg/icons`); this barrel
 * exists so the whole set can be seen in one place.
 */
export * from "./icons";
export * from "./marks";

/**
 * Every drawn mark in the app, one file each.
 *
 * All are built on the same 80×80 grid with matching stroke weight, so any
 * mark can stand in for any other without retuning the layout around it, and
 * the set reads as one hand rather than a pile of borrowed icons.
 *
 * Import a mark directly where you need the shape itself (BottomNav), or go
 * through CardMark when you want one positioned faintly behind card content.
 */
export { default as Belt } from "./Belt";
export { default as Bell } from "./Bell";
export { default as Glove } from "./Glove";
export { default as Octagon, OCTAGON_INNER, OCTAGON_OUTER } from "./Octagon";
export { default as Trophy } from "./Trophy";
export { GOLD } from "./types";
export type { MarkProps } from "./types";

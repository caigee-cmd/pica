/** BoardUI-ish avatar silhouettes (SVG path in 0..100 viewBox). */
export type ShapeId =
  | "circle"
  | "shield"
  | "blob"
  | "diamond"
  | "star"
  | "heart"
  | "cloud"
  | "petal";

export const SHAPE_PRESETS: { id: ShapeId; label: string }[] = [
  { id: "circle", label: "Circle" },
  { id: "shield", label: "Shield" },
  { id: "blob", label: "Blob" },
  { id: "diamond", label: "Diamond" },
  { id: "star", label: "Star" },
  { id: "heart", label: "Heart" },
  { id: "cloud", label: "Cloud" },
  { id: "petal", label: "Petal" },
];

/** Filled path or ellipse data for each shape. */
export const SHAPE_PATHS: Record<ShapeId, string> = {
  circle: "", // rendered as <ellipse>
  shield:
    "M50 6 L86 20 V48 C86 72 70 88 50 96 C30 88 14 72 14 48 V20 Z",
  blob:
    "M50 8 C68 8 86 22 88 42 C90 62 78 86 50 92 C22 86 10 62 12 42 C14 22 32 8 50 8 Z",
  diamond: "M50 6 L92 50 L50 94 L8 50 Z",
  star:
    "M50 6 L61 38 L94 38 L67 58 L78 90 L50 72 L22 90 L33 58 L6 38 L39 38 Z",
  heart:
    "M50 88 C20 68 8 48 8 32 C8 18 18 10 30 10 C40 10 47 16 50 22 C53 16 60 10 70 10 C82 10 92 18 92 32 C92 48 80 68 50 88 Z",
  cloud:
    "M28 72 H74 C86 72 92 62 92 52 C92 40 84 32 72 32 C70 20 60 12 48 12 C34 12 24 22 22 34 C12 36 8 44 8 52 C8 64 16 72 28 72 Z",
  petal:
    "M50 92 C50 92 18 62 18 38 C18 22 32 10 50 10 C68 10 82 22 82 38 C82 62 50 92 50 92 Z",
};

export function normalizeShape(value: unknown): ShapeId {
  if (
    value === "circle" ||
    value === "shield" ||
    value === "blob" ||
    value === "diamond" ||
    value === "star" ||
    value === "heart" ||
    value === "cloud" ||
    value === "petal"
  ) {
    return value;
  }
  return "circle";
}

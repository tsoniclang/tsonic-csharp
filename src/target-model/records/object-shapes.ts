import type { CsharpObjectShapeFact } from "../types/model.js";

export type CsharpProjectConstructibleTypeProjection =
  | { readonly kind: "unchanged" }
  | { readonly kind: "resolved"; readonly shape: CsharpObjectShapeFact }
  | { readonly kind: "rejected"; readonly reason: string };

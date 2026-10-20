import type { TargetTypeRef } from "../types/model.js";
import type { CsharpClosedTypeTest } from "../operations/type-tests.js";

export type CsharpClosedTypeTestEmission =
  | { readonly kind: "constant"; readonly value: boolean }
  | { readonly kind: "runtime-array"; readonly dispatch: "instance" | "static" }
  | { readonly kind: "native"; readonly target: TargetTypeRef }
  | { readonly kind: "js-value"; readonly target: TargetTypeRef }
  | { readonly kind: "optional"; readonly element: TargetTypeRef; readonly test: CsharpClosedTypeTestEmission }
  | { readonly kind: "union"; readonly carrier: TargetTypeRef; readonly arms: readonly CsharpClosedTypeTestEmission[] };

export interface CsharpClosedTypeTestRecords {
  readonly closedTypeTestEmission: { readonly get: (fact: CsharpClosedTypeTest) => CsharpClosedTypeTestEmission | undefined };
}

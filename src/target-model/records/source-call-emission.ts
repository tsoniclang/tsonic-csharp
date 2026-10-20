import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../types/model.js";
import type { CsharpSourceCalleeSelection } from "../operations/source-callees.js";
import type { CsharpSourceCallResult } from "../operations/source-call-results.js";
import type { CsharpConversionSelection } from "../conversions/selection.js";
import type { CsharpSourceArgumentGroupingEntry } from "./operations.js";
import type { CsharpUnionCallClassification } from "./union-calls.js";

export type CsharpSourceArgumentEmissionGroup =
  | { readonly kind: "collect"; readonly arguments: readonly { readonly index: number; readonly spread: boolean }[] }
  | { readonly kind: "value"; readonly index: number }
  | { readonly kind: "absence"; readonly type: TargetTypeRef; readonly conversion: CsharpConversionSelection; readonly literal: boolean };

export interface CsharpSourceArgumentsEmission {
  readonly arguments: readonly { readonly node: Node; readonly parameter: CsharpSourceArgumentGroupingEntry["parameter"]; readonly form: CsharpSourceArgumentGroupingEntry["sourceForm"] }[];
  readonly groups: readonly CsharpSourceArgumentEmissionGroup[];
}

export type CsharpSourceCallEmission =
  | { readonly kind: "source"; readonly callee: Extract<CsharpSourceCalleeSelection, { readonly kind: "function" | "method" | "value" }>;
      readonly result: CsharpSourceCallResult; readonly typeArguments: readonly TargetTypeRef[]; readonly methodValue: string | undefined;
      readonly optionalCallee: { readonly expression: Node; readonly type: TargetTypeRef } | undefined }
  | { readonly kind: "union"; readonly union: Extract<CsharpUnionCallClassification, { readonly kind: "resolved" }>;
      readonly typeArguments: readonly TargetTypeRef[]; readonly parameters: readonly TargetTypeRef[]; readonly void: boolean };

export interface CsharpSourceCallEmissionRecords {
  readonly sourceCallEmission: { readonly get: (node: Node) => CsharpSourceCallEmission | undefined };
  readonly sourceArgumentsEmission: { readonly get: (node: Node) => CsharpSourceArgumentsEmission | undefined };
}

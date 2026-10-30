import type { Node } from "@tsonic/tsts";
import type { CsharpTargetParameter, TargetTypeRef } from "../../types/model.js";
import type { CsharpProviderArgumentMapping, CsharpSelectedCallArgument, CsharpCallArgumentProjection } from "../objects/members.js";
import type { CsharpRestSequence } from "../objects/rest-sequences.js";
import type { CsharpConversionSelection } from "../../conversions/selection.js";

export type CsharpCallArgumentForm = CsharpSelectedCallArgument["sourceForm"];
export type CsharpCallArgumentEmission =
  | { readonly kind: "plain"; readonly target: TargetTypeRef }
  | { readonly kind: "convert"; readonly read: "expression" | "argument"; readonly source: TargetTypeRef;
      readonly target: TargetTypeRef; readonly conversion: CsharpConversionSelection }
  | { readonly kind: "argument-vector"; readonly source: TargetTypeRef; readonly target: TargetTypeRef; readonly vector: TargetTypeRef;
      readonly parameters: readonly { readonly type: TargetTypeRef; readonly rest: boolean }[] };

export type CsharpTargetArgumentOperand =
  | { readonly kind: "projection"; readonly projection: CsharpCallArgumentProjection; readonly parameter: CsharpTargetParameter }
  | { readonly kind: "sequence"; readonly sequence: CsharpRestSequence }
  | { readonly kind: "argument"; readonly expression: Node; readonly parameter: CsharpTargetParameter; readonly form: CsharpCallArgumentForm;
      readonly mapping: CsharpProviderArgumentMapping | undefined };

export interface CsharpTargetArgumentsEmission {
  readonly operands: readonly CsharpTargetArgumentOperand[];
  readonly reordered: boolean;
  readonly groups: readonly { readonly collect: boolean; readonly arguments: readonly { readonly index: number; readonly spread: boolean }[] }[];
}

export interface CsharpTargetArgumentRecords {
  readonly callArgumentEmission: { readonly get: (expression: Node, parameter: CsharpTargetParameter, form: CsharpCallArgumentForm,
    mapping: CsharpProviderArgumentMapping | undefined) => CsharpCallArgumentEmission | undefined };
  readonly targetArgumentsEmission: { readonly get: (node: Node) => CsharpTargetArgumentsEmission | undefined };
}

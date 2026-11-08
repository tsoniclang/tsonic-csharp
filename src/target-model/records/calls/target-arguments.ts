import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../types/native-type-data.js";
import type { CsharpTargetParameter } from "../../types/model.js";
import type { CsharpProviderArgumentMapping, CsharpSelectedCallArgument, CsharpCallArgumentProjection } from "../objects/members.js";
import type { CsharpRestSequence } from "../objects/rest-sequences.js";
import type { CsharpConversionSelection } from "../../conversions/selection.js";

export type CsharpCallArgumentForm = CsharpSelectedCallArgument["sourceForm"];
export type CsharpCallArgumentEmission =
  | { readonly kind: "plain"; readonly target: TargetTypeRef }
  | { readonly kind: "native-binding"; readonly source: TargetTypeRef; readonly target: TargetTypeRef }
  | { readonly kind: "convert"; readonly read: "expression" | "argument"; readonly source: TargetTypeRef;
      readonly target: TargetTypeRef; readonly conversion: CsharpConversionSelection }
  | { readonly kind: "argument-vector"; readonly source: TargetTypeRef; readonly target: TargetTypeRef; readonly vector: TargetTypeRef;
      readonly parameters: readonly { readonly type: TargetTypeRef; readonly rest: boolean }[] };

export type CsharpTargetArgumentOperand =
  | { readonly kind: "projection"; readonly binding: number; readonly projection: CsharpCallArgumentProjection; readonly parameter: CsharpTargetParameter }
  | { readonly kind: "sequence"; readonly binding: number; readonly sequence: CsharpRestSequence }
  | { readonly kind: "argument"; readonly expression: Node; readonly parameter: CsharpTargetParameter; readonly form: CsharpCallArgumentForm;
      readonly binding: number; readonly mapping: CsharpProviderArgumentMapping | undefined }
  | { readonly kind: "expanded"; readonly expression: Node; readonly carrier: TargetTypeRef;
      readonly values: readonly CsharpExpandedCallArgument[] }
  | { readonly kind: "discard"; readonly expression: Node };

export interface CsharpExpandedCallArgument {
  readonly binding: number;
  readonly read: { readonly kind: "value" } | { readonly kind: "tuple"; readonly name: string }
    | { readonly kind: "collection"; readonly index: number };
  readonly source: TargetTypeRef;
  readonly target: TargetTypeRef;
  readonly conversion: CsharpConversionSelection;
}

export type CsharpCallArgumentEmissionGroup =
  | { readonly kind: "collect"; readonly arguments: readonly { readonly index: number; readonly spread: boolean }[] }
  | { readonly kind: "value"; readonly index: number }
  | { readonly kind: "absence"; readonly type: TargetTypeRef; readonly conversion: CsharpConversionSelection; readonly literal: boolean };

export interface CsharpTargetArgumentsEmission {
  readonly operands: readonly CsharpTargetArgumentOperand[];
  readonly suspends: readonly boolean[];
  readonly bindings: readonly CsharpTargetParameter[];
  readonly reordered: boolean;
  readonly groups: readonly CsharpCallArgumentEmissionGroup[];
}

export interface CsharpTargetArgumentRecords {
  readonly callArgumentEmission: { readonly get: (expression: Node, parameter: CsharpTargetParameter, form: CsharpCallArgumentForm,
    mapping: CsharpProviderArgumentMapping | undefined) => CsharpCallArgumentEmission | undefined };
  readonly targetArgumentsEmission: { readonly get: (node: Node) => CsharpTargetArgumentsEmission | undefined };
}

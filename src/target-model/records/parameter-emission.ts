import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../types/model.js";
import type { CsharpConversionSelection } from "../conversions/selection.js";

export type CsharpLambdaParameterEntry =
  | { readonly kind: "identity" }
  | { readonly kind: "default"; readonly declareIncoming: boolean }
  | { readonly kind: "conversion"; readonly source: TargetTypeRef; readonly target: TargetTypeRef; readonly conversion: CsharpConversionSelection };

export type CsharpParameterDefaultEmission =
  | { readonly kind: "none" | "null" | "default" }
  | { readonly kind: "literal"; readonly expression: Node };

export interface CsharpCallableParameterEmission {
  readonly carrier: TargetTypeRef;
  readonly binding: "identifier" | "pattern";
  readonly rest: boolean;
  readonly default: CsharpParameterDefaultEmission;
}

export interface CsharpCallableParameterRecords {
  readonly callableParameter: { readonly get: (subject: Node) => CsharpCallableParameterEmission | undefined };
  readonly lambdaParameterEntry: { readonly get: (subject: Node) => CsharpLambdaParameterEntry | undefined };
}

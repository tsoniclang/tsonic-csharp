import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../types/model.js";

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
}

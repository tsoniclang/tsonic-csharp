import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../types/model.js";
import type { CsharpJsValueOperationSelection, CsharpJsValueInvocation } from "../operations/js-values.js";

type ResolvedOperation = Extract<CsharpJsValueOperationSelection, { readonly kind: "resolved" }>;
export interface CsharpJsCallEmission {
  readonly operation: ResolvedOperation;
  readonly present: CsharpJsValueInvocation;
  readonly receiver: Node;
  readonly arguments: readonly Node[];
  readonly optionalCall: boolean;
  readonly callSubject: Node;
  readonly member: {
    readonly read: CsharpJsValueInvocation;
    readonly optional: boolean;
    readonly key: { readonly kind: "literal"; readonly value: string; readonly carrier: TargetTypeRef } | { readonly kind: "expression"; readonly expression: Node };
  } | undefined;
}
export interface CsharpJsCallRecords {
  readonly jsCall: { readonly get: (node: Node) => CsharpJsCallEmission | undefined };
}

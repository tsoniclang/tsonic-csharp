import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef, CsharpTypeofRuntimeKind } from "../../types/model.js";
import type { CsharpTypeofResult } from "../../types/runtime-kind.js";
import type { CsharpJsValueInvocation } from "../../operations/js-values.js";
import type { CsharpClosedTypeTest } from "../../operations/type-tests.js";

export type CsharpTypePredicateEmission =
  | { readonly kind: "factory"; readonly left: Node; readonly right: Node; readonly carrier: TargetTypeRef; readonly method: string }
  | { readonly kind: "native"; readonly left: Node; readonly fact: CsharpClosedTypeTest };

export type CsharpTypeofOperationEmission =
  | { readonly kind: "js-value"; readonly operation: CsharpJsValueInvocation }
  | { readonly kind: "category"; readonly carrier: TargetTypeRef; readonly category: CsharpTypeofResult }
  | { readonly kind: "constant"; readonly value: boolean };

export interface CsharpTypeofEmission {
  readonly operand: Node;
  readonly operation: CsharpTypeofOperationEmission;
  readonly comparison: { readonly runtimeKind: CsharpTypeofRuntimeKind; readonly negated: boolean } | undefined;
}

export interface CsharpTypeofEmissionRecords {
  readonly typePredicateEmission: { readonly get: (node: Node) => CsharpTypePredicateEmission | undefined };
  readonly typeofEmission: { readonly get: (node: Node) => CsharpTypeofEmission | undefined };
}

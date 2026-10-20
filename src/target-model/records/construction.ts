import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../types/model.js";
import type { CsharpSelectedTargetCall } from "./members.js";
import type { CsharpJsValueInvocation } from "../operations/js-values.js";

export type CsharpAdmittedConstruction =
  | { readonly kind: "js-value"; readonly callee: Node; readonly arguments: readonly Node[]; readonly result: TargetTypeRef; readonly operation: CsharpJsValueInvocation }
  | { readonly kind: "native"; readonly selection: CsharpSelectedTargetCall; readonly result: TargetTypeRef; readonly owner: TargetTypeRef;
      readonly invocation: { readonly kind: "constructor" | "factory" } | { readonly kind: "module"; readonly index: number; readonly entry: string } }
  | { readonly kind: "source"; readonly result: TargetTypeRef; readonly invocation:
      | { readonly kind: "constructor"; readonly owner: TargetTypeRef }
      | { readonly kind: "factory"; readonly callee: Node; readonly method: string; readonly arguments: readonly TargetTypeRef[] }
      | { readonly kind: "delegate"; readonly callee: Node } };

export interface CsharpConstructionRecords {
  readonly constructionEmission: { readonly get: (node: Node) => CsharpAdmittedConstruction | undefined };
}

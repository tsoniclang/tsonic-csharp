import type { Node } from "@tsonic/tsts";
import type { CsharpSelectedTargetCall } from "../objects/members.js";
import type { ResolvedSourceCallInfo } from "./source-calls.js";
import type { CsharpObjectShapeProjectionDeclaration } from "../objects/object-shape-demand.js";
import type { TargetTypeRef } from "../../types/model.js";
import type { CsharpSourceOperator } from "../../syntax/operators.js";

export type CsharpTargetInvocationEmission =
  | { readonly kind: "integer-truncation"; readonly target: TargetTypeRef; readonly signed: boolean }
  | { readonly kind: "native-task-resolution"; readonly form: "value" | "task" | "absence";
      readonly owner: TargetTypeRef; readonly payload: TargetTypeRef }
  | { readonly kind: "numeric"; readonly target: TargetTypeRef; readonly identity: boolean }
  | { readonly kind: "constructor"; readonly owner: TargetTypeRef }
  | { readonly kind: "array" }
  | { readonly kind: "projection"; readonly projection: CsharpObjectShapeProjectionDeclaration }
  | { readonly kind: "protocol"; readonly owner: TargetTypeRef; readonly name: string; readonly method: string;
      readonly types: readonly TargetTypeRef[]; readonly forwarded: number; readonly receiver: TargetTypeRef; readonly lifted: TargetTypeRef | undefined }
  | { readonly kind: "indexer"; readonly indexes: readonly number[]; readonly value: number | undefined }
  | { readonly kind: "event"; readonly owner: TargetTypeRef | undefined; readonly name: string; readonly add: boolean }
  | { readonly kind: "operator"; readonly form: "prefix" | "binary"; readonly operator: CsharpSourceOperator; readonly checked: boolean; readonly operands: readonly number[] }
  | { readonly kind: "static-member"; readonly owner: TargetTypeRef; readonly name: string; readonly operation: "call" | "property-get" | "property-set" | "event-add" | "event-remove" }
  | { readonly kind: "method"; readonly owner: TargetTypeRef | undefined; readonly name: string };

export interface CsharpTargetCallEmission {
  readonly source: ResolvedSourceCallInfo;
  readonly selection: CsharpSelectedTargetCall;
  readonly result: TargetTypeRef;
  readonly instance: boolean;
  readonly invocation: CsharpTargetInvocationEmission;
}
export interface CsharpTargetCallEmissionRecords {
  readonly targetCallEmission: { readonly get: (node: Node) => CsharpTargetCallEmission | undefined };
}

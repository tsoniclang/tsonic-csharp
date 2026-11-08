import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../types/native-type-data.js";
import type { CsharpSourceCalleeSelection } from "../../operations/source-callees.js";
import type { CsharpSourceCallResult } from "../../operations/source-call-results.js";
import type { CsharpUnionCallClassification } from "./union-calls.js";
import type { CsharpNativeCallableMember } from "../../types/model.js";

export type CsharpSourceCallEmission =
  | { readonly kind: "skipped"; readonly callee: Node; readonly result: TargetTypeRef }
  | { readonly kind: "source"; readonly callee: Extract<CsharpSourceCalleeSelection, { readonly kind: "function" | "method" | "value" }>;
      readonly result: CsharpSourceCallResult; readonly typeArguments: readonly TargetTypeRef[]; readonly member: CsharpNativeCallableMember;
      readonly optionalCallee: { readonly expression: Node; readonly type: TargetTypeRef } | undefined }
  | { readonly kind: "union"; readonly union: Extract<CsharpUnionCallClassification, { readonly kind: "resolved" }>;
      readonly typeArguments: readonly TargetTypeRef[]; readonly parameters: readonly TargetTypeRef[]; readonly void: boolean };

export interface CsharpSourceCallEmissionRecords {
  readonly sourceCallEmission: { readonly get: (node: Node) => CsharpSourceCallEmission | undefined };
  readonly callOptional: { readonly get: (node: Node) => { readonly optional: boolean; readonly receiver: Node | undefined } | undefined };
  readonly arrayCreationCall: { readonly get: (node: Node) => TargetTypeRef | undefined };
}

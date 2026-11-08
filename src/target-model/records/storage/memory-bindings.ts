import type { TargetTypeRef } from "../../types/native-type-data.js";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact } from "../../types/model.js";
import type { Node } from "@tsonic/tsts";

export type CsharpMemoryBindingSelection =
  | { readonly kind: "rejected"; readonly reason: string }
  | { readonly kind: "field"; readonly type: TargetTypeRef; readonly expression: Node }
  | { readonly kind: "record"; readonly type: TargetTypeRef; readonly shape: CsharpObjectShapeFact;
      readonly fields: readonly { readonly expression: Node; readonly member: CsharpObjectShapeMemberFact }[] };

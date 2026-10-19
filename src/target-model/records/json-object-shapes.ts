import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, TargetTypeRef } from "../types/model.js";

export const csharpJsonObjectProtocol = Object.freeze({ sourceProperty: "toJSON" });

export type CsharpJsonObjectShapeContract =
  | { readonly kind: "properties"; readonly properties: readonly { readonly key: string; readonly name: string }[] }
  | { readonly kind: "to-json"; readonly member: CsharpObjectShapeMemberFact; readonly returnType: TargetTypeRef; readonly passesPropertyKey: boolean };

export type CsharpJsonObjectShapeContractResult =
  | { readonly kind: "resolved"; readonly contract: CsharpJsonObjectShapeContract }
  | { readonly kind: "rejected"; readonly reason: string };

export interface CsharpJsonObjectShapeRecords {
  readonly jsonObjectShape: { readonly get: (shape: CsharpObjectShapeFact) => CsharpJsonObjectShapeContract | undefined };
}

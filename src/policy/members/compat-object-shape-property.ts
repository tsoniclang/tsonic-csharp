import type {
  SourceFile,
} from "@tsonic/tsts";
import type {
  CsharpObjectShapeFact,
  CsharpObjectShapeMemberFact,
  CsharpObjectShapePolicy,
} from "../types/index.js";
import {
  resolveCsharpCompatObjectShapeMember,
} from "../types/index.js";
import type {
  CsharpTargetPropertySelection,
} from "./target-selection.js";

export type CsharpCompatObjectShapePropertyResolution =
  | { readonly kind: "not-compat-object-shape" }
  | {
      readonly kind: "resolved";
      readonly shape: CsharpObjectShapeFact;
      readonly member: CsharpObjectShapeMemberFact;
    }
  | { readonly kind: "rejected"; readonly reason: string };

export function resolveCsharpCompatObjectShapeProperty(
  objectShapes: CsharpObjectShapePolicy,
  selection: Extract<
    CsharpTargetPropertySelection,
    { readonly kind: "source-owned" }
  >,
  sourceFile: SourceFile,
): CsharpCompatObjectShapePropertyResolution {
  const shape = objectShapes.resolveNode(
    selection.source.receiver.expression,
    sourceFile,
  );
  if (shape === undefined) {
    return { kind: "not-compat-object-shape" };
  }
  const member = resolveCsharpCompatObjectShapeMember(
    shape,
    [
      selection.source.selectedSymbol,
      selection.source.selectedDeclaration,
    ],
  );
  switch (member.kind) {
    case "not-compat-object-shape":
      return member;
    case "rejected":
      return member;
    case "resolved":
      return { kind: "resolved", shape, member: member.member };
  }
}

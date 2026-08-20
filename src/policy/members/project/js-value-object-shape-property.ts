import type {
  SourceFile,
} from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type {
  CsharpObjectShapeFact,
  CsharpObjectShapeMemberFact,
  CsharpObjectShapePolicy,
} from "../../types/index.js";
import {
  resolveCsharpJsValueObjectShapeMember,
} from "../../types/index.js";
import type {
  CsharpTargetPropertySelection,
} from "../selection/target-selection.js";

export type CsharpJsValueObjectShapePropertyResolution =
  | { readonly kind: "not-js-value-object-shape" }
  | {
      readonly kind: "resolved";
      readonly shape: CsharpObjectShapeFact;
      readonly member: CsharpObjectShapeMemberFact;
    }
  | { readonly kind: "rejected"; readonly reason: string };

export function resolveCsharpJsValueObjectShapeProperty(
  objectShapes: CsharpObjectShapePolicy,
  semantics: SourceFileSemantics,
  selection: Extract<
    CsharpTargetPropertySelection,
    { readonly kind: "source-owned" }
  >,
  sourceFile: SourceFile,
): CsharpJsValueObjectShapePropertyResolution {
  const shape = objectShapes.resolveNode(
    selection.source.receiver.expression,
    sourceFile,
  );
  if (shape === undefined) {
    return { kind: "not-js-value-object-shape" };
  }
  const member = resolveCsharpJsValueObjectShapeMember(
    shape,
    semantics.facts.selectedSubjects(
      selection.source.selectedSymbol,
      selection.source.selectedDeclaration,
    ),
  );
  switch (member.kind) {
    case "not-js-value-object-shape":
      return member;
    case "rejected":
      return member;
    case "resolved":
      return { kind: "resolved", shape, member: member.member };
  }
}

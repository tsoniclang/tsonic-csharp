import type { ExtensionFactSubject } from "@tsonic/tsts";
import type {
  CsharpObjectShapeFact,
  CsharpObjectShapeMemberFact,
} from "../../../types/index.js";
import {
  resolveCsharpJsValueObjectShapeMember,
} from "../../../types/index.js";

export type CsharpJsValueObjectShapePropertyResolution =
  | { readonly kind: "not-js-value-object-shape" }
  | {
      readonly kind: "resolved";
      readonly shape: CsharpObjectShapeFact;
      readonly member: CsharpObjectShapeMemberFact;
    }
  | { readonly kind: "rejected"; readonly reason: string };

export function resolveCsharpJsValueObjectShapeProperty(
  shape: CsharpObjectShapeFact | undefined,
  selectedSubjects: readonly ExtensionFactSubject[],
): CsharpJsValueObjectShapePropertyResolution {
  if (shape === undefined) {
    return { kind: "not-js-value-object-shape" };
  }
  const member = resolveCsharpJsValueObjectShapeMember(
    shape,
    selectedSubjects,
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

import type { CsharpJsValueObjectShapePropertyResolution } from "../../../../target-model/records/js-value-object-shape-property.js";
import type { ExtensionFactSubject } from "@tsonic/tsts";
import type { CsharpObjectShapeFact } from "../../../types/index.js";
import { resolveCsharpJsValueObjectShapeMember } from "../../../types/objects/js-value-shapes.js";

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

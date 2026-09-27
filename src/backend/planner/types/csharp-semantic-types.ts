import type {
  SourceFile,
  Type,
} from "@tsonic/tsts";
import type {
  CsharpPlanningContext,
} from "../context.js";
import type {
  CsharpTypeNode,
} from "../../target-ast/roslyn/index.js";
import {
  csharpTypeFromTargetTypeRef,
} from "./target-types.js";
import {
  csharpBigIntegerTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpVoidTargetType,
} from "../../../target-model/types/index.js";

export function getCsharpTypeFromSemanticType(
  type: Type | undefined,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
): CsharpTypeNode | undefined {
  if (type === undefined) {
    return undefined;
  }
  const classification = input.program.sourceEvidence.semanticType(
    type,
    sourceFile,
  );
  if (
    classification === undefined ||
    classification.intrinsic === "any" ||
    classification.intrinsic === "unknown"
  ) {
    return undefined;
  }
  const targetType = classification.typeParameter ?? classification.targetType;
  const resolved = targetType === undefined
    ? undefined
    : csharpTypeFromTargetTypeRef(targetType, input.scope.typeParameterNames);
  if (resolved !== undefined) {
    return resolved;
  }
  const intrinsicTarget = classification.intrinsic === "boolean"
    ? csharpSourcePrimitiveTargetType("bool")
    : classification.intrinsic === "number"
      ? csharpSourcePrimitiveTargetType("float64")
      : classification.intrinsic === "string"
        ? csharpStringTargetType()
        : classification.intrinsic === "bigint"
          ? csharpBigIntegerTargetType()
          : classification.intrinsic === "void"
            ? csharpVoidTargetType()
            : undefined;
  return intrinsicTarget === undefined
    ? undefined
    : csharpTypeFromTargetTypeRef(intrinsicTarget, input.scope.typeParameterNames);
}

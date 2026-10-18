import { sourceArrayElementType, type SourceFileSemantics, type SourceLiteralIndex } from "@tsonic/target-api/source";
import type { AstReader, Node, Type } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { csharpSourcePrimitiveTargetType } from "../../../target-model/types/carriers/scalar-types.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/carriers/nullable.js";
import { getCsharpGenericOptionalParts, getCsharpRuntimeUnionArms, isCsharpAbsenceTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";
import { getCsharpArrayLiteralElementTargetType } from "../../../target-model/types/carriers/collections.js";
import { getCsharpAwaitResultTargetType } from "../../operations/control-flow/await-completions.js";
import { isCsharpDestructuringAssignmentPattern, isCsharpAssignmentOperator, sourceOperatorFromKindName } from "../../../target-model/syntax/operators.js";
import { selectCsharpNumericBinaryPromotion } from "../../operations/numeric/promotion.js";
import { sourcePrimitiveImplicitlyConverts } from "../../conversions/source-primitives.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import type { CsharpTypeDefinitions } from "../../../target-model/types/source-union-definitions.js";
import { resolveCsharpShortCircuitResult } from "./short-circuit-values.js";
import { classifyCsharpSourceProfileType } from "./source-profile.js";

export function csharpSourceAnnotationCoversRepresentation(
  source: Type,
  annotation: TargetTypeRef,
  actual: TargetTypeRef,
  semantics: SourceFileSemantics,
  ast: AstReader,
  definitions?: CsharpTypeDefinitions,
): boolean {
  if (targetTypeRefEquals(annotation, actual)) return true;
  if (semantics.types.isUnion(source)) {
    const annotatedNullable = getCsharpNullableElementTargetType(annotation);
    const actualNullable = getCsharpNullableElementTargetType(actual);
    if (annotatedNullable !== undefined || actualNullable !== undefined) {
      const present = semantics.types.unionOrIntersectionTypes(source).filter(member => !semantics.types.isNullish(member));
      if (annotatedNullable === undefined || actualNullable === undefined || present.length === 0) return false;
      if (present.length === 1) return csharpSourceAnnotationCoversRepresentation(
        present[0]!, annotatedNullable, actualNullable, semantics, ast, definitions);
    }
    const annotatedArms = getCsharpRuntimeUnionArms(annotatedNullable ?? annotation, definitions);
    const actualArms = getCsharpRuntimeUnionArms(actualNullable ?? actual, definitions);
    return annotatedArms !== undefined && actualArms !== undefined && annotatedArms.length === actualArms.length &&
      annotatedArms.every(arm => actualArms.some(candidate => targetTypeRefEquals(arm, candidate))) &&
      actualArms.every(arm => annotatedArms.some(candidate => targetTypeRefEquals(arm, candidate)));
  }
  if (semantics.types.isTuple(source)) {
    const elements = semantics.types.tupleElementTypes(source);
    return annotation.kind === "tuple" && actual.kind === "tuple" && elements.length === annotation.elements.length &&
      elements.length === actual.elements.length && elements.every((element, index) =>
        csharpSourceAnnotationCoversRepresentation(element, annotation.elements[index]!, actual.elements[index]!, semantics, ast, definitions));
  }
  const profile = classifyCsharpSourceProfileType(source, semantics, ast);
  if (profile?.kind !== "array" && profile?.kind !== "readonly-array") return false;
  const sourceElement = sourceArrayElementType(source, semantics);
  const annotatedElement = getCsharpArrayLiteralElementTargetType(annotation);
  const actualElement = getCsharpArrayLiteralElementTargetType(actual);
  const sameContainer = annotation.kind === "array" && actual.kind === "array"
    ? (annotation.rank ?? 1) === (actual.rank ?? 1)
    : annotation.kind === "target-named" && actual.kind === "target-named" &&
      targetTypeRefEquals({ ...actual, typeArguments: annotation.typeArguments }, annotation);
  return sameContainer && sourceElement !== undefined && annotatedElement !== undefined && actualElement !== undefined &&
    csharpSourceAnnotationCoversRepresentation(sourceElement, annotatedElement, actualElement, semantics, ast, definitions);
}

export function resolveBinaryTargetRepresentation(
  ast: AstReader,
  literalValues: SourceLiteralIndex,
  operator: ReturnType<typeof sourceOperatorFromKindName>,
  leftNode: Node | undefined,
  left: TargetTypeRef | undefined,
  rightNode: Node | undefined,
  right: TargetTypeRef | undefined,
): TargetTypeRef | undefined {
  if (operator === undefined || left === undefined || right === undefined) {
    return undefined;
  }
  if (operator === "??=") {
    const valueType = getCsharpNullableElementTargetType(left);
    return valueType !== undefined && targetTypeRefEquals(valueType, right)
      ? valueType
      : left;
  }
  if (isCsharpAssignmentOperator(operator)) {
    return operator === "=" &&
        isCsharpDestructuringAssignmentPattern(ast, leftNode)
      ? right
      : left;
  }
  switch (operator) {
    case "===":
    case "==":
    case "!==":
    case "!=":
    case "<":
    case "<=":
    case ">":
    case ">=":
    case "in":
    case "instanceof":
      return csharpSourcePrimitiveTargetType("bool");
    case "&&":
    case "||":
      return resolveCsharpShortCircuitResult(ast, operator, leftNode, left, right);
    case ",":
      return right;
    case "<<":
    case ">>":
    case ">>>":
      return left;
    case "??": {
      if (targetTypeRefEquals(left, right) || isCsharpAbsenceTargetType(right)) return left;
      const nonNullableLeft = getNonNullableTargetRepresentation(left);
      const numeric = leftNode === undefined || rightNode === undefined
        ? undefined
        : selectCsharpNumericBinaryPromotion(
            { literalValues },
            leftNode,
            nonNullableLeft,
            rightNode,
            right,
          );
      return numeric?.resultType ??
        commonTargetRepresentation(nonNullableLeft, right);
    }
    default: {
      const numeric = leftNode === undefined || rightNode === undefined
        ? undefined
        : selectCsharpNumericBinaryPromotion(
            { literalValues },
            leftNode,
            left,
            rightNode,
            right,
          );
      return numeric?.resultType ?? commonTargetRepresentation(left, right);
    }
  }
}

export function commonTargetRepresentation(
  left: TargetTypeRef | undefined,
  right: TargetTypeRef | undefined,
): TargetTypeRef | undefined {
  if (left === undefined || right === undefined) {
    return undefined;
  }
  if (targetTypeRefEquals(left, right)) {
    return left;
  }
  if (sourcePrimitiveImplicitlyConverts(right, left)) {
    return right;
  }
  if (sourcePrimitiveImplicitlyConverts(left, right)) {
    return left;
  }
  return undefined;
}

export function getNonNullableTargetRepresentation(
  type: TargetTypeRef,
): TargetTypeRef {
  return getCsharpNullableElementTargetType(type) ?? getCsharpGenericOptionalParts(type)?.element ?? type;
}

export function getTaskResultType(
  type: TargetTypeRef,
  definitions?: CsharpTypeDefinitions,
): TargetTypeRef | undefined {
  return getCsharpAwaitResultTargetType(type, definitions);
}

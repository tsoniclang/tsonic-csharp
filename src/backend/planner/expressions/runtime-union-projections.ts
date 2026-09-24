import type { CsharpPlanningContext } from "../context.js";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import {
  targetTypeRefEquals,
  type TargetTypeRef,
} from "../../../target-model/types/index.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpExpression,
} from "../../target-ast/roslyn/index.js";
import {
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";
import {
  getCsharpRuntimeUnionArms,
  getCsharpGenericOptionalParts,
} from "../../../target-model/types/index.js";

export function tryPlanRuntimeUnionTypeTest(
  node: Node,
  targetType: TargetTypeRef,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  baseExpression: CsharpExpression,
  negated: boolean,
): CsharpExpression | undefined {
  const storageCarrier = getRuntimeUnionStorageCarrier(node, sourceFile, input);
  if (storageCarrier === undefined) {
    return undefined;
  }
  const armIndex = runtimeUnionArmIndex(storageCarrier, targetType);
  if (armIndex === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "Runtime union type-test emission requires the selected target comparison type to match a finalized runtime-union arm.",
    ));
    return undefined;
  }
  const test = runtimeUnionArmTest(baseExpression, armIndex, storageCarrier);
  return negated
    ? {
        kind: "PrefixUnaryExpression",
        operatorToken: { kind: "ExclamationToken" },
        operand: test,
      }
    : test;
}

export function tryPlanRuntimeUnionProjectionToTargetType(
  node: Node,
  targetType: TargetTypeRef,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  baseExpression: CsharpExpression,
): CsharpExpression | undefined {
  const storageCarrier = getRuntimeUnionStorageCarrier(node, sourceFile, input);
  if (storageCarrier === undefined) {
    return undefined;
  }
  const armIndex = runtimeUnionArmIndex(storageCarrier, targetType);
  if (armIndex === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "Runtime union member projection requires the selected declaring target type to match a finalized runtime-union arm.",
    ));
    return undefined;
  }
  return runtimeUnionArmProjection(baseExpression, armIndex, storageCarrier);
}

function getRuntimeUnionStorageCarrier(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
): TargetTypeRef | undefined {
  const storageCarrier = input.types.classifications.resolveStorage(node, sourceFile);
  return getCsharpRuntimeUnionArms(storageCarrier) !== undefined
    ? storageCarrier
    : undefined;
}

function runtimeUnionArmIndex(
  unionCarrier: TargetTypeRef,
  targetType: TargetTypeRef,
): number | undefined {
  const armIndex = getCsharpRuntimeUnionArms(unionCarrier)?.findIndex((arm) => targetTypeRefEquals(arm, targetType));
  return armIndex === undefined || armIndex < 0 ? undefined : armIndex;
}

export function runtimeUnionArmProjection(
  baseExpression: CsharpExpression,
  armIndex: number,
  carrier?: TargetTypeRef,
): CsharpExpression {
  const optional = getCsharpGenericOptionalParts(carrier);
  return {
    kind: "InvocationExpression",
    callee: {
      kind: "SimpleMemberAccessExpression",
      receiver: optional === undefined ? baseExpression : { kind: "IdentifierName", name: optional.operations.name },
      name: `As${armIndex + 1}`,
    },
    arguments: optional === undefined ? [] : [{ kind: "Argument", expression: baseExpression }],
  };
}

export function runtimeUnionArmTest(
  baseExpression: CsharpExpression,
  armIndex: number,
  carrier?: TargetTypeRef,
): CsharpExpression {
  const optional = getCsharpGenericOptionalParts(carrier);
  return {
    kind: "InvocationExpression",
    callee: {
      kind: "SimpleMemberAccessExpression",
      receiver: optional === undefined ? baseExpression : { kind: "IdentifierName", name: optional.operations.name },
      name: `Is${armIndex + 1}`,
    },
    arguments: optional === undefined ? [] : [{ kind: "Argument", expression: baseExpression }],
  };
}

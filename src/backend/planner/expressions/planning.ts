import type { CsharpPlanningContext } from "../context.js";
import {
  KindArrowFunction,
  KindCallExpression,
  KindArrayLiteralExpression,
  KindBinaryExpression,
  KindDeleteExpression,
  KindElementAccessExpression,
  KindFunctionExpression,
  KindIdentifier,
  KindNewExpression,
  KindObjectLiteralExpression,
  KindPostfixUnaryExpression,
  KindPrefixUnaryExpression,
  KindPropertyAccessExpression,
  KindRegularExpressionLiteral,
  KindTemplateExpression,
  KindTypeOfExpression,
  KindVoidExpression,
  SourceKind,
} from "@tsonic/target-api/source";
import {
  type Node,
  type SourceFile,
} from "@tsonic/tsts";
import {
  selectCsharpSourceArgument,
} from "../../../policy/members/index.js";
import {
  readCsharpSourceDefaultValue,
} from "../../../policy/types/index.js";
import type {
  CsharpTargetParameter,
  TargetTypeRef,
} from "../../../policy/types/index.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { sourceNodesEqual } from "@tsonic/target-api/source";
import type { CsharpArgument, CsharpExpression, CsharpTypeNode } from "../../roslyn/syntax.js";
import type { DestructuringPlannerState } from "../bindings/index.js";
import {
  planArrayLiteralExpressionFromFacts,
} from "./array-literals/index.js";
import { getCsharpTypeForNode } from "../types/index.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";
import { planRegularExpressionLiteral } from "./regular-expression-literals.js";
import {
  planTypeofExpression,
  tryPlanBinaryExpression,
} from "./operators.js";
import {
  planArrowFunctionExpression,
  planFunctionExpression,
} from "./expression-lambdas.js";
import {
  planIdentifierExpression,
} from "./expression-source-references.js";
import {
  planCallExpression,
  planElementAccessExpression,
  planPropertyAccessExpression,
} from "./target-members/index.js";
import { planExpressionWithExpectedTypeCore } from "./expression-expected-types.js";
import {
  planCallArgumentCore,
} from "./expression-call-arguments.js";
import {
  planNewExpression,
} from "./expression-new.js";
import {
  planTemplateExpression,
} from "./expression-template-strings.js";
import {
  planVoidExpression,
} from "./expression-void.js";
import {
  planPostfixUnaryExpression,
  planPrefixUnaryExpression,
} from "./expression-unary.js";
import {
  tryPlanJsArrayDeleteExpression,
} from "./expression-js-array-mutations.js";
import {
  tryPlanSourceSyntaxExpression,
} from "./expression-source-syntax.js";
import {
  tryPlanDestructuringAssignmentExpression,
} from "../bindings/destructuring-assignment.js";
import {
  selectCsharpExpressionConversion,
} from "../../../policy/conversions/index.js";
import {
  applyCsharpConversionSelection,
} from "./conversions.js";
import {
  requireCsharpStorageRepresentation,
} from "../artifacts/storage-representation.js";
import {
  tryPlanCsharpTypedLocationOperation,
} from "./expression-typed-locations.js";
import {
  tryPlanCsharpExplicitSafetyExpression,
} from "../safety/explicit-safety.js";
import {
  tryPlanCsharpNativePointerOperation,
} from "./expression-native-pointers.js";

export function planExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state?: DestructuringPlannerState,
): CsharpExpression | undefined {
  return planExpressionCore(node, sourceFile, input, diagnostics, state);
}

function planExpressionCore(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state?: DestructuringPlannerState,
): CsharpExpression | undefined {
  const expressionOverride = state?.expressionOverrides.get(node);
  if (expressionOverride !== undefined) {
    return expressionOverride;
  }
  const defaultValue = readCsharpSourceDefaultValue(input.sourceFacts, node);
  if (defaultValue !== undefined) {
    return {
      kind: "DefaultExpression",
      nullForgiving: true,
      type: getCsharpTypeForNode(
        defaultValue.sourceType,
        sourceFile,
        input,
        undefined,
        diagnostics,
      ),
    };
  }
  const argumentPassing = selectCsharpSourceArgument(input.sourceFacts, node);
  if (
    argumentPassing.kind === "resolved" &&
    !sourceNodesEqual(
      input.ast,
      argumentPassing.argument.storageExpression,
      node,
    )
  ) {
    return planExpression(
      argumentPassing.argument.storageExpression,
      sourceFile,
      input,
      diagnostics,
      state,
    );
  }
  const scopedPlanExpression = (
    expressionNode: Node,
    expressionSourceFile: SourceFile,
    expressionInput: CsharpPlanningContext,
    expressionDiagnostics: TargetDiagnostic[],
    nestedState?: DestructuringPlannerState,
  ): CsharpExpression | undefined => planExpression(
    expressionNode,
    expressionSourceFile,
    expressionInput,
    expressionDiagnostics,
    nestedState ?? state,
  );
  const scopedPlanCallArgument = (
    argumentNode: Node,
    argumentSourceFile: SourceFile,
    argumentInput: CsharpPlanningContext,
    argumentDiagnostics: TargetDiagnostic[],
    expectedType?: CsharpTypeNode,
    expectedTypeSubject?: Node,
    conversionExpectedTargetType?: TargetTypeRef,
    expectedArgumentPassingMode?: CsharpTargetParameter["passingMode"],
    selectedTargetParameter?: CsharpTargetParameter,
  ): CsharpArgument | undefined => planCallArgument(
    argumentNode,
    argumentSourceFile,
    argumentInput,
    argumentDiagnostics,
    expectedType,
    expectedTypeSubject,
    conversionExpectedTargetType,
    state,
    expectedArgumentPassingMode,
    selectedTargetParameter,
  );
  const explicitSafety = tryPlanCsharpExplicitSafetyExpression(
    node,
    sourceFile,
    input,
    diagnostics,
    state,
    planExpression,
  );
  if (explicitSafety.handled) {
    return explicitSafety.expression;
  }
  const nativePointerOperation = tryPlanCsharpNativePointerOperation(
    node,
    sourceFile,
    input,
    diagnostics,
    scopedPlanExpression,
    (
      expressionNode,
      expressionSourceFile,
      expressionInput,
      expressionDiagnostics,
      expressionExpectedType,
      expectedTypeSubject,
      expectedTargetType,
      nestedState,
    ) => planExpressionWithExpectedType(
      expressionNode,
      expressionSourceFile,
      expressionInput,
      expressionDiagnostics,
      expressionExpectedType,
      expectedTypeSubject,
      nestedState ?? state,
      expectedTargetType,
    ),
    state,
  );
  if (nativePointerOperation.handled) {
    return nativePointerOperation.expression;
  }
  const typedLocationOperation = tryPlanCsharpTypedLocationOperation(
    node,
    sourceFile,
    input,
    diagnostics,
    scopedPlanExpression,
    (
      expressionNode,
      expressionSourceFile,
      expressionInput,
      expressionDiagnostics,
      expressionExpectedType,
      expectedTypeSubject,
      expectedTargetType,
    ) => planExpressionWithExpectedType(
      expressionNode,
      expressionSourceFile,
      expressionInput,
      expressionDiagnostics,
      expressionExpectedType,
      expectedTypeSubject,
      state,
      expectedTargetType,
    ),
    state,
  );
  if (typedLocationOperation.handled) {
    return typedLocationOperation.expression;
  }
  const sourceSyntaxDiagnosticsStart = diagnostics.length;
  const sourceSyntax = tryPlanSourceSyntaxExpression(node, sourceFile, input, diagnostics, scopedPlanExpression);
  if (sourceSyntax !== undefined) {
    return sourceSyntax;
  }
  if (diagnostics.length > sourceSyntaxDiagnosticsStart) {
    return undefined;
  }
  switch (SourceKind(input.ast, node)) {
    case KindIdentifier:
      return planIdentifierExpression(node, sourceFile, input, diagnostics, state);
    case KindRegularExpressionLiteral:
      return planRegularExpressionLiteral(node, sourceFile, input, diagnostics);
    case KindTypeOfExpression:
      return planTypeofExpression(
        node,
        sourceFile,
        input,
        diagnostics,
        scopedPlanExpression,
      );
    case KindVoidExpression:
      return planVoidExpression(node, sourceFile, input, diagnostics, scopedPlanExpression);
    case KindDeleteExpression:
      return tryPlanJsArrayDeleteExpression(
        node,
        sourceFile,
        input,
        diagnostics,
        scopedPlanExpression,
        scopedPlanCallArgument,
      );
    case KindArrayLiteralExpression: {
      return planArrayLiteralExpressionFromFacts(node, sourceFile, input, diagnostics, {
        planExpression: (element, elementSourceFile, elementInput, elementDiagnostics) =>
          planExpression(element, elementSourceFile, elementInput, elementDiagnostics, state),
        planExpressionWithExpectedType: (element, elementSourceFile, elementInput, elementDiagnostics, expectedType, expectedTypeSubject, expectedTargetType) =>
          planExpressionWithExpectedType(element, elementSourceFile, elementInput, elementDiagnostics, expectedType, expectedTypeSubject, state, expectedTargetType),
      });
    }
    case KindObjectLiteralExpression:
      diagnostics.push(unsupportedNodeDiagnostic(node, "Object literals require an explicit target type before C# emission."));
      return undefined;
    case KindTemplateExpression:
      return planTemplateExpression(node, sourceFile, input, diagnostics, scopedPlanExpression);
    case KindPropertyAccessExpression:
      return planPropertyAccessExpression(node, sourceFile, input, diagnostics, scopedPlanExpression);
    case KindElementAccessExpression:
      return planElementAccessExpression(
        node,
        sourceFile,
        input,
        diagnostics,
        scopedPlanExpression,
        (
          argumentNode,
          argumentSourceFile,
          argumentInput,
          argumentDiagnostics,
          expectedType,
          expectedTypeSubject,
          conversionExpectedTargetType,
          expectedArgumentPassingMode,
          selectedTargetParameter,
        ) =>
          planCallArgument(
            argumentNode,
            argumentSourceFile,
            argumentInput,
            argumentDiagnostics,
            expectedType,
            expectedTypeSubject,
            conversionExpectedTargetType,
            state,
            expectedArgumentPassingMode,
            selectedTargetParameter,
          ),
      );
    case KindArrowFunction:
      return planArrowFunctionExpression(
        node,
        sourceFile,
        input,
        diagnostics,
        scopedPlanExpression,
        undefined,
        state,
        undefined,
        (expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics, expressionExpectedType, expectedTypeSubject, expectedTargetType, nestedState) =>
          planExpressionWithExpectedType(expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics, expressionExpectedType, expectedTypeSubject, nestedState ?? state, expectedTargetType),
      );
    case KindFunctionExpression:
      return planFunctionExpression(node, sourceFile, input, diagnostics, undefined, state);
    case KindCallExpression:
      return planCallExpression(
        node,
        sourceFile,
        input,
        diagnostics,
        (expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics) =>
          planExpression(expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics, state),
        (argumentNode, argumentSourceFile, argumentInput, argumentDiagnostics, expectedType, expectedTypeSubject, conversionExpectedTargetType, expectedArgumentPassingMode, selectedTargetParameter) =>
          planCallArgument(argumentNode, argumentSourceFile, argumentInput, argumentDiagnostics, expectedType, expectedTypeSubject, conversionExpectedTargetType, state, expectedArgumentPassingMode, selectedTargetParameter),
      );
    case KindNewExpression:
      return planNewExpression(node, sourceFile, input, diagnostics, scopedPlanExpression, (argumentNode, argumentSourceFile, argumentInput, argumentDiagnostics, expectedType, expectedTypeSubject, conversionExpectedTargetType, expectedArgumentPassingMode, selectedTargetParameter) =>
        planCallArgument(argumentNode, argumentSourceFile, argumentInput, argumentDiagnostics, expectedType, expectedTypeSubject, conversionExpectedTargetType, state, expectedArgumentPassingMode, selectedTargetParameter));
    case KindPrefixUnaryExpression: {
      return planPrefixUnaryExpression(node, sourceFile, input, diagnostics, scopedPlanExpression);
    }
    case KindPostfixUnaryExpression: {
      return planPostfixUnaryExpression(node, sourceFile, input, diagnostics, scopedPlanExpression);
    }
    case KindBinaryExpression: {
      const destructuringAssignment = tryPlanDestructuringAssignmentExpression(
        node,
        sourceFile,
        input,
        diagnostics,
        state,
        (expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics) =>
          planExpression(expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics, state),
        (expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics, expressionExpectedType, expectedTypeSubject, nestedState) =>
          planExpressionWithExpectedType(expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics, expressionExpectedType, expectedTypeSubject, nestedState ?? state),
      );
      if (destructuringAssignment !== undefined) {
        return destructuringAssignment;
      }
      if (diagnostics.length > sourceSyntaxDiagnosticsStart) {
        return undefined;
      }
      const binary = tryPlanBinaryExpression(node, sourceFile, input, diagnostics, (expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics) =>
        planExpression(expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics, state), scopedPlanCallArgument, (expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics, expressionExpectedType, expectedTypeSubject, expectedTargetType) =>
        planExpressionWithExpectedType(expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics, expressionExpectedType, expectedTypeSubject, state, expectedTargetType));
      return binary;
    }
    default: {
      diagnostics.push(unsupportedNodeDiagnostic(node, "Expression is outside the current C# planning surface."));
      return undefined;
    }
  }
}

export function planCallArgument(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  expectedType?: CsharpTypeNode,
  expectedTypeSubject?: Node,
  conversionExpectedTargetType?: TargetTypeRef,
  state?: DestructuringPlannerState,
  expectedArgumentPassingMode?: CsharpTargetParameter["passingMode"],
  selectedTargetParameter?: CsharpTargetParameter,
): CsharpArgument | undefined {
  return planCallArgumentCore(
    node,
    sourceFile,
    input,
    diagnostics,
    (expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics, nestedState) =>
      planExpression(expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics, nestedState ?? state),
    (expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics, expressionExpectedType, expectedTypeSubject, nestedExpectedTargetType, nestedState) =>
      planExpressionWithExpectedType(expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics, expressionExpectedType, expectedTypeSubject, nestedState ?? state, nestedExpectedTargetType),
    expectedType,
    expectedTypeSubject,
    conversionExpectedTargetType,
    expectedArgumentPassingMode,
    state,
    selectedTargetParameter,
  );
}

export function planExpressionWithExpectedType(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  expectedType: CsharpTypeNode,
  expectedTypeSubject?: Node,
  state?: DestructuringPlannerState,
  expectedTargetType?: TargetTypeRef,
): CsharpExpression | undefined {
  const effectiveExpectedTargetType = expectedTargetType ??
    (
      expectedTypeSubject === undefined
        ? undefined
        : input.types.resolveNode(expectedTypeSubject, sourceFile)
    );
  const plan = planExpressionWithExpectedTypeCore(node, sourceFile, input, diagnostics, expectedType, expectedTypeSubject, {
    planExpression: (expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics, nestedState) =>
      planExpression(expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics, nestedState ?? state),
    planExpressionWithExpectedType: (expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics, nestedExpectedType, nestedExpectedTypeSubject, nestedExpectedTargetType, nestedState) =>
      planExpressionWithExpectedType(expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics, nestedExpectedType, nestedExpectedTypeSubject, nestedState ?? state, nestedExpectedTargetType),
  }, state, effectiveExpectedTargetType);
  if (plan === undefined || effectiveExpectedTargetType === undefined) {
    return plan?.expression;
  }
  if (plan.representation === "expected") {
    return plan.expression;
  }
  const sourceType = input.types.resolveNode(node, sourceFile);
  const selection = selectCsharpExpressionConversion(
    input,
    node,
    sourceType,
    effectiveExpectedTargetType,
    "implicit",
  );
  if (selection.kind === "rejected") {
    const requirement = requireCsharpStorageRepresentation(
      input,
      node,
      sourceFile,
      effectiveExpectedTargetType,
    );
    if (requirement.kind === "requested") {
      return undefined;
    }
    if (requirement.kind === "rejected") {
      diagnostics.push(unsupportedNodeDiagnostic(node, requirement.reason));
      return undefined;
    }
  }
  return applyCsharpConversionSelection(
    node,
    sourceFile,
    input,
    diagnostics,
    sourceType,
    effectiveExpectedTargetType,
    selection,
    plan.expression,
  );
}

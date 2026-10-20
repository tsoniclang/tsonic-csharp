import type { CsharpPlanningContext } from "../context.js";
import { planCsharpMemoryBinding } from "./memory-bindings.js";
import {
  KindArrowFunction,
  KindCallExpression,
  KindBinaryExpression,
  KindDeleteExpression,
  KindElementAccessExpression,
  KindFunctionExpression,
  KindIdentifier,
  KindNewExpression,
  KindPostfixUnaryExpression,
  KindPrefixUnaryExpression,
  KindPropertyAccessExpression,
  KindRegularExpressionLiteral,
  KindTemplateExpression,
  KindTypeOfExpression,
  SourceKind,
} from "@tsonic/target-api/source";
import {
  type Node,
  type SourceFile,
} from "@tsonic/tsts";
import type {
  CsharpTargetParameter,
  TargetTypeRef,
} from "../../../target-model/types/index.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpExpression } from "../../target-ast/syntax/index.js";
import type { DestructuringPlannerState } from "../bindings/index.js";
import { getCsharpExpressionOverride } from "../bindings/binding-state.js";
import { getCsharpTypeForNode } from "../types/index.js";
import { failCsharpPlannerInvariant } from "../../invariants.js";
import { planClassFactoryExpression } from "../declarations/classes/factories.js";
import { planRegularExpressionLiteral } from "./regular-expression-literals.js";
import {
  planTypeofExpression,
  tryPlanBinaryExpression,
} from "./operators.js";
import {
  planArrowFunctionExpression,
  planFunctionExpression,
} from "./callable.js";
import {
  planCsharpIdentifierValue,
} from "./expression-source-references.js";
import {
  planCallExpression,
  planElementAccessExpression,
  planPropertyAccessExpression,
} from "./target-members/index.js";
import { planCsharpNativeExpression } from "./expression-expected-types.js";
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
  planPostfixUnaryExpression,
  planPrefixUnaryExpression,
} from "./expression-unary.js";
import {
  tryPlanJsArrayMutationExpression,
} from "./expression-js-array-mutations.js";
import { planCsharpElementDeletion } from "./expression-element-deletion.js";
import {
  tryPlanSourceSyntaxExpression,
} from "./expression-source-syntax.js";
import {
  tryPlanDestructuringAssignmentExpression,
} from "../bindings/destructuring-assignment.js";
import {
  planCsharpTypedLocationOperation,
  planCsharpProjectedFieldWrite,
} from "./typed-locations.js";
import {
  planCsharpExplicitSafetyExpression,
} from "../safety/explicit-safety.js";
import {
  planCsharpNativePointerOperation,
} from "./expression-native-pointers.js";
import {
  planCsharpJsStringConversion,
} from "./expression-js-string-conversion.js";
import { csharpPlannedValue, type CsharpPlannedArgument, type CsharpPlannedValue } from "./planned-values.js";
import { planCsharpExpressionCompletion } from "./planned-value-composition.js";
import { captureCsharpPlannedValue } from "./planned-value-composition.js";
import { qualifiedCsharpType } from "../types/index.js";
import type { CsharpPromiseDiscard } from "../../../target-model/records/promise-results.js";
import type { CsharpStatement } from "../../target-ast/syntax/index.js";
import { requireExpressionPlan } from "./required-plan.js";
import { readCsharpNativeExpressionCarrier } from "./native-uses.js";

export function planExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state?: DestructuringPlannerState,
): CsharpPlannedValue | undefined {
  return requireExpressionPlan(node, () => {
    const planned = planSelectedExpression(node, sourceFile, input, diagnostics, state);
    const discard = input.program.records.promiseResult.get(node)?.discard;
    if (planned === undefined || planned.completion.kind !== "value" || discard === undefined) return planned;
    const captured = captureCsharpPlannedValue(node, input, diagnostics, planned.completion.carrier);
    if (captured === undefined) return undefined;
    const expression: CsharpExpression = { kind: "IdentifierName", name: captured.name };
    return csharpPlannedValue(planned.completion.carrier, expression, [...planned.prelude,
      { kind: "LocalDeclarationStatement", name: captured.name, type: captured.type, initializer: planned.completion.expression },
      ...planCsharpPromiseObservation(discard, expression),
    ]);
  });
}

function planCsharpPromiseObservation(selection: CsharpPromiseDiscard, expression: CsharpExpression): readonly CsharpStatement[] {
  if (selection.kind === "task") return [{ kind: "ExpressionStatement", expression: {
    kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression",
      receiver: qualifiedCsharpType("Tsonic.CSharp.Js", "PromiseRuntime"), name: "ObserveDiscarded" },
    arguments: [{ kind: "Argument", expression }],
  } }];
  if (selection.kind === "optional") return [{ kind: "IfStatement", condition: { kind: "BinaryExpression",
    left: expression, operatorToken: { kind: "ExclamationEqualsToken" }, right: { kind: "LiteralExpression", value: null } },
    thenBody: { kind: "Block", statements: planCsharpPromiseObservation(selection.present, selection.valueType
      ? { kind: "SimpleMemberAccessExpression", receiver: expression, name: "Value" } : expression) } }];
  return selection.arms.map(arm => ({ kind: "IfStatement", condition: { kind: "InvocationExpression",
    callee: { kind: "SimpleMemberAccessExpression", receiver: expression, name: `Is${arm.index + 1}` }, arguments: [] },
    thenBody: { kind: "Block", statements: planCsharpPromiseObservation(arm.selection, { kind: "InvocationExpression",
      callee: { kind: "SimpleMemberAccessExpression", receiver: expression, name: `As${arm.index + 1}` }, arguments: [] }) } }));
}

function planExpressionCore(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state?: DestructuringPlannerState,
): CsharpPlannedValue | undefined {
  const complete = (expression: CsharpExpression | undefined): CsharpPlannedValue | undefined =>
    planCsharpExpressionCompletion(node, sourceFile, input, diagnostics, expression, readCsharpNativeExpressionCarrier(input, node));
  if (input.program.source.ast.is.IsClassExpression(node)) {
    const factory = input.program.records.classFactory.get(node);
    if (factory !== undefined) return planClassFactoryExpression(factory, sourceFile, input, diagnostics, state);
    failCsharpPlannerInvariant("An admitted class expression requires its sealed native factory.", node);
  }
  const expressionOverride = getCsharpExpressionOverride(node, state);
  if (expressionOverride !== undefined) {
    const planned = complete(expressionOverride);
    return planned === undefined ? undefined : { ...planned, address: { kind: "root" } };
  }
  const defaultValue = input.program.records.sourceDefaultValue.get(node);
  if (defaultValue !== undefined) {
    return complete({
      kind: "DefaultExpression",
      nullForgiving: true,
      type: getCsharpTypeForNode(
        defaultValue.sourceType,
        sourceFile,
        input, diagnostics,
      ),
    });
  }
  const storage = input.program.records.nativeExpression.get(node)?.storage
    ?? failCsharpPlannerInvariant("An admitted source expression requires its selected storage operand.", node);
  if (storage !== node) {
    return planExpression(
      storage,
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
  ): CsharpPlannedValue | undefined => planExpression(
    expressionNode,
    expressionSourceFile,
    expressionInput,
    expressionDiagnostics,
    nestedState ?? state,
  );
  const scopedPlanCallArgument = (argumentNode: Node, argumentSourceFile: SourceFile, argumentInput: CsharpPlanningContext, argumentDiagnostics: TargetDiagnostic[], conversionExpectedTargetType?: TargetTypeRef, expectedArgumentPassingMode?: CsharpTargetParameter["passingMode"], selectedTargetParameter?: CsharpTargetParameter
  ): CsharpPlannedArgument | undefined => planCallArgument(argumentNode, argumentSourceFile, argumentInput, argumentDiagnostics, conversionExpectedTargetType, state, expectedArgumentPassingMode, selectedTargetParameter
  );
  const nativeHandler = input.program.records.nativeHandler.get(node);
  switch (nativeHandler?.kind) {
    case "memory-binding":
      {
        return planCsharpMemoryBinding(node, nativeHandler.selection, sourceFile, input, diagnostics, scopedPlanExpression);
      }
    case "explicit-safety":
      {
        return planCsharpExplicitSafetyExpression(
          node,
          nativeHandler.selection,
          sourceFile,
          input,
          diagnostics,
          state,
          planExpression,
        );
      }
    case "js-string-conversion":
      {
        return planCsharpJsStringConversion(
          node,
          nativeHandler.selection,
          sourceFile,
          input,
          diagnostics,
          scopedPlanExpression,
        );
      }
    case "native-pointer":
      {
        return planCsharpNativePointerOperation(node, nativeHandler.selection, sourceFile, input, diagnostics, scopedPlanExpression, state
        );
      }
    case "typed-location":
      {
        return planCsharpTypedLocationOperation(node, sourceFile, input, diagnostics, scopedPlanExpression, state
        );
      }
    case undefined:
      break;
  }
  const sourceSyntax = tryPlanSourceSyntaxExpression(node, sourceFile, input, diagnostics, scopedPlanExpression);
  if (sourceSyntax !== undefined) {
    return sourceSyntax;
  }
  switch (SourceKind(input.program.source.ast, node)) {
    case KindIdentifier:
      return planCsharpIdentifierValue(node, sourceFile, input, diagnostics, state);
    case KindRegularExpressionLiteral:
      return complete(planRegularExpressionLiteral(node, input, diagnostics));
    case KindTypeOfExpression:
      return planTypeofExpression(
        node,
        sourceFile,
        input,
        diagnostics,
        scopedPlanExpression,
        state,
      );
    case KindDeleteExpression:
      return planCsharpElementDeletion(
        node,
        sourceFile,
        input,
        diagnostics,
        scopedPlanExpression,
        scopedPlanCallArgument,
      );
    case KindTemplateExpression:
      return planTemplateExpression(node, sourceFile, input, diagnostics, scopedPlanExpression);
    case KindPropertyAccessExpression: {
      const property = planPropertyAccessExpression(node, sourceFile, input, diagnostics, scopedPlanExpression);
      return property === undefined ? undefined : planCsharpProjectedFieldWrite(
        node, property, sourceFile, input, diagnostics, scopedPlanExpression, state,
      );
    }
    case KindElementAccessExpression: {
      const element = planElementAccessExpression(
        node,
        sourceFile,
        input,
        diagnostics,
        scopedPlanExpression,
        (argumentNode, argumentSourceFile, argumentInput, argumentDiagnostics, conversionExpectedTargetType, expectedArgumentPassingMode, selectedTargetParameter
        ) =>
          planCallArgument(argumentNode, argumentSourceFile, argumentInput, argumentDiagnostics, conversionExpectedTargetType, state, expectedArgumentPassingMode, selectedTargetParameter
          ),
      );
      return element === undefined ? undefined : planCsharpProjectedFieldWrite(
        node, element, sourceFile, input, diagnostics, scopedPlanExpression, state,
      );
    }
    case KindArrowFunction:
      return planArrowFunctionExpression(node, sourceFile, input, diagnostics, scopedPlanExpression, state
      );
    case KindFunctionExpression:
      return planFunctionExpression(node, sourceFile, input, diagnostics, state);
    case KindCallExpression:
      return planCallExpression(
        node,
        sourceFile,
        input,
        diagnostics,
        (expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics) =>
          planExpression(expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics, state),
        (argumentNode, argumentSourceFile, argumentInput, argumentDiagnostics, conversionExpectedTargetType, expectedArgumentPassingMode, selectedTargetParameter) =>
          planCallArgument(argumentNode, argumentSourceFile, argumentInput, argumentDiagnostics, conversionExpectedTargetType, state, expectedArgumentPassingMode, selectedTargetParameter),
        state,
      );
    case KindNewExpression:
      return planNewExpression(node, sourceFile, input, diagnostics, scopedPlanExpression, (argumentNode, argumentSourceFile, argumentInput, argumentDiagnostics, conversionExpectedTargetType, expectedArgumentPassingMode, selectedTargetParameter) =>
        planCallArgument(argumentNode, argumentSourceFile, argumentInput, argumentDiagnostics, conversionExpectedTargetType, state, expectedArgumentPassingMode, selectedTargetParameter));
    case KindPrefixUnaryExpression:
    case KindPostfixUnaryExpression: {
      if (input.program.records.operatorForm.get(node) === "js-array-mutation") {
        return tryPlanJsArrayMutationExpression(node, sourceFile, input, diagnostics, scopedPlanExpression,
          (argument, file, context, errors, target, passing, parameter) =>
            planCallArgument(argument, file, context, errors, target, state, passing, parameter),
          state);
      }
      if (SourceKind(input.program.source.ast, node) === KindPostfixUnaryExpression) {
        return planPostfixUnaryExpression(node, sourceFile, input, diagnostics, scopedPlanExpression);
      }
      return planPrefixUnaryExpression(node, sourceFile, input, diagnostics, scopedPlanExpression);
    }
    case KindBinaryExpression: {
      if (input.program.records.operatorForm.get(node) === "destructuring-assignment") return tryPlanDestructuringAssignmentExpression(node, sourceFile, input, diagnostics, state, (expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics) =>
          planExpression(expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics, state)
      );
      const binary = tryPlanBinaryExpression(node, sourceFile, input, diagnostics, (expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics) =>
        planExpression(expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics, state), scopedPlanCallArgument, state);
      return binary;
    }
    default: {
      failCsharpPlannerInvariant("An admitted source expression requires its selected native renderer.", node);
    }
  }
}

export function planCallArgument(node: Node, sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[], conversionExpectedTargetType?: TargetTypeRef, state?: DestructuringPlannerState, expectedArgumentPassingMode?: CsharpTargetParameter["passingMode"], selectedTargetParameter?: CsharpTargetParameter
): CsharpPlannedArgument | undefined {
  return requireExpressionPlan(node, () => planCallArgumentCore(node, sourceFile, input, diagnostics, (expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics, nestedState) =>
      planExpression(expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics, nestedState ?? state), state, selectedTargetParameter
  ));
}



function planSelectedExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state?: DestructuringPlannerState,
): CsharpPlannedValue | undefined {
  return planCsharpNativeExpression(node, sourceFile, input, diagnostics, {planSourceExpression: planExpressionCore,
planExpression: (expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics, nestedState) =>
      planExpression(expressionNode, expressionSourceFile, expressionInput, expressionDiagnostics, nestedState ?? state)
  }, state);
}

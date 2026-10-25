import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpConversionMode,
  CsharpConversionSelection,
} from "../../../target-model/conversions/selection.js";
import type {
  TargetTypeRef,
} from "../../../target-model/types/index.js";
import {
  csharpTsUnionTargetType,
  csharpTsValueTargetType,
  targetTypeRefKey,
} from "../../../target-model/types/index.js";
import type {
  CsharpExpression,
  CsharpTypeNode,
} from "../../target-ast/syntax/index.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import { csharpTypeFromTargetTypeRef } from "../types/render.js";
import {
  qualifiedCsharpType,
} from "../types/index.js";
import {
  csharpGeneratedConversionHelperName,
  csharpGeneratedHelperNamespace,
} from "../../../target-model/records/generated-helpers.js";
import type {
  CsharpPlanningContext,
} from "../context.js";
import {
  planCsharpExactLiteralConversion,
} from "./literal-conversions.js";
import { planCsharpNeverValue } from "./never-values.js";
import {
  planCsharpJsValueBox,
} from "./js-value-operations.js";
import { planCsharpEmptyRecordConversion } from "./empty-record-conversion.js";
import { planCsharpRuntimeUnionProjection } from "./runtime-union-projections.js";
import { planCsharpUnionMapping } from "./union-mappings.js";
import { planCsharpDelegateAdapter } from "./callable-conversions.js";
import type { CsharpPlannedCallable } from "./planned-values.js";
import { planCsharpAbsentValue } from "./optional-storage.js";

export function readCsharpConversionClassification(
  node: Node,
  input: CsharpPlanningContext,
  _diagnostics: TargetDiagnostic[],
  sourceType: TargetTypeRef | undefined,
  targetType: TargetTypeRef | undefined,
  mode: CsharpConversionMode,
): CsharpConversionSelection | undefined {
  const selection = input.program.records.conversion.get(
    sourceType,
    targetType,
    mode,
  );
  if (selection === undefined) {
    return failCsharpPlannerInvariant(
      "C# planning requires a sealed target conversion classification that analysis did not produce.",
      node);
  }
  if (selection.kind === "rejected" || selection.kind === "ambiguous") {
    return failCsharpPlannerInvariant(`C# conversion reached planning after pre-seal refusal: ${selection.reason}`, node);
  }
  return selection;
}

export function readCsharpExpressionConversionClassification(
  node: Node,
  input: CsharpPlanningContext,
  _diagnostics: TargetDiagnostic[],
  sourceType: TargetTypeRef | undefined,
  targetType: TargetTypeRef | undefined,
  mode: CsharpConversionMode,
): CsharpConversionSelection | undefined {
  const selection = input.program.records.expressionConversion.get(
    node,
    sourceType,
    targetType,
    mode,
  );
  if (selection === undefined) {
    return failCsharpPlannerInvariant(
      `C# planning requires a sealed ${mode} expression conversion from '${sourceType === undefined ? "<unresolved>" : targetTypeRefKey(sourceType)}' to '${targetType === undefined ? "<unresolved>" : targetTypeRefKey(targetType)}'.`,
      node);
  }
  return selection;
}

export function applyCsharpConversionSelection(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  sourceType: TargetTypeRef | undefined,
  targetType: TargetTypeRef | undefined,
  selection: CsharpConversionSelection,
  expression: CsharpExpression | undefined,
  absenceConstant = false,
  callable?: CsharpPlannedCallable,
): CsharpExpression | undefined {
  if (expression === undefined) {
    return undefined;
  }
  switch (selection.kind) {
    case "union-map":
      return planCsharpUnionMapping(node, expression, sourceType, targetType, selection, input, diagnostics);
    case "never": {
      const type = renderRequiredTargetType(input.scope.typeParameterNames, node, targetType, diagnostics);
      return type === undefined ? undefined : planCsharpNeverValue(expression, type);
    }
    case "checked-native-integer": {
      const type = renderRequiredTargetType(input.scope.typeParameterNames, node, targetType, diagnostics);
      return type === undefined ? undefined : {
        kind: "CheckedExpression",
        expression: { kind: "CastExpression", type, expression },
      };
    }
    case "exact-integer": {
      const source = renderRequiredTargetType(input.scope.typeParameterNames, node, selection.input, diagnostics);
      const target = renderRequiredTargetType(input.scope.typeParameterNames, node, selection.output, diagnostics);
      return source === undefined || target === undefined ? undefined : {
        kind: "InvocationExpression",
        callee: {
          kind: "SimpleMemberAccessExpression",
          receiver: qualifiedCsharpType("Tsonic.CSharp.Runtime", "IntegerConversions"),
          name: selection.nullable ? "CheckedNullable" : "Checked",
          typeArguments: [source, target],
        },
        arguments: [{ kind: "Argument", expression }],
      };
    }
    case "integer-truncation":
      return failCsharpPlannerInvariant("A native integer truncation must be emitted directly by its selected call form.", node);
    case "identity":
      return expression;
    case "absence": {
      const source = sourceType === undefined ? undefined
        : csharpTypeFromTargetTypeRef(sourceType, input.scope.typeParameterNames);
      const absent = targetType === undefined ? undefined
        : planCsharpAbsentValue(targetType, input);
      if (source === undefined || absent === undefined) {
        return failCsharpPlannerInvariant(
          "An admitted absence conversion requires its renderable source and destination storage contracts.", node);
      }
      return absenceConstant ? absent : {
          kind: "SwitchExpression", expression: { kind: "CastExpression", type: source, expression },
          arms: [{ pattern: { kind: "DiscardPattern" }, expression: absent }],
        };
    }
    case "array-like-union": {
      const type = renderRequiredTargetType(input.scope.typeParameterNames, node, targetType, diagnostics);
      if (type === undefined) return undefined;
      return {
        kind: "InvocationExpression",
        callee: { kind: "SimpleMemberAccessExpression", receiver: expression, name: "Match", typeArguments: [type] },
        arguments: selection.arms.map((_, index) => {
          const name = `__tsonic_array_arm${index + 1}`;
          return { kind: "Argument", expression: {
            kind: "LambdaExpression", parameters: [{ kind: "Parameter", name }],
            body: { kind: "IdentifierName", name },
          } };
        }),
      };
    }
    case "empty-record":
      return planCsharpEmptyRecordConversion(input.scope.typeParameterNames, selection, sourceType, targetType, expression);
    case "implicit":
      if (selection.proof === "checked-floating-literal") {
        const type = renderRequiredTargetType(input.scope.typeParameterNames, node, targetType, diagnostics);
        return type === undefined ? undefined : { kind: "CastExpression", type, expression };
      }
      if (selection.proof === "literal") {
        const literal = planCsharpExactLiteralConversion(input, node, targetType);
        if (literal.kind === "resolved") {
          return literal.expression;
        }
        if (literal.kind === "rejected") {
          return failCsharpPlannerInvariant(literal.reason, node);
        }
        if (literal.kind === "source-representation") {
          return expression;
        }
        return failCsharpPlannerInvariant(
          "A selected C# literal conversion requires an exact target literal representation.",
          node);
      }
      return selection.proof === "runtime-union-arm"
        ? applyRuntimeUnionArmConversion(
            node,
            sourceFile,
            input,
            diagnostics,
            sourceType,
            targetType,
            selection,
            expression,
          )
        : expression;
    case "nullable-reference":
      return { kind: "PostfixUnaryExpression", operand: expression, operatorToken: { kind: "ExclamationToken" } };
    case "nullable-value":
      // Both an authored assertion and a narrowing proven by analysis (a sealed flow read) are non-null here; C# flow
      // analysis cannot see TypeScript narrowing, so the access is explicit in both cases (RULINGS 2026-10-22, CS8629).
      return {
        kind: "SimpleMemberAccessExpression",
        receiver: { kind: "PostfixUnaryExpression", operand: expression, operatorToken: { kind: "ExclamationToken" } },
        name: "Value",
      };
    case "runtime-union-projection":
      return planCsharpRuntimeUnionProjection(node, sourceType, targetType, selection, expression, diagnostics, input);
    case "nullable-map": {
      const sourceElement = selection.sourceElement;
      const targetElement = selection.targetElement;
      const presentType = renderRequiredTargetType(input.scope.typeParameterNames, node, sourceElement, diagnostics);
      const resultType = renderRequiredTargetType(input.scope.typeParameterNames, node, targetType, diagnostics);
      if (presentType === undefined || resultType === undefined) return undefined;
      const name = input.names.temporaryName(`__tsonic_present_${input.program.source.ast.pos(node)}_${input.program.source.ast.end(node)}`);
      const present = applyCsharpConversionSelection(node, sourceFile, input, diagnostics,
        sourceElement, targetElement, selection.conversion, { kind: "IdentifierName", name });
      return present === undefined ? undefined : {
        kind: "ConditionalExpression",
        condition: { kind: "IsPatternExpression", expression, type: presentType, designation: name },
        whenTrue: present,
        whenFalse: { kind: "DefaultExpression", type: resultType },
      };
    }
    case "runtime-union-reference": {
      const type = renderRequiredTargetType(input.scope.typeParameterNames, node,
        requiredTypeEmission(input, selection.target, node).optionalStorage.present, diagnostics);
      return type === undefined ? undefined : {
        kind: "InvocationExpression",
        callee: { kind: "SimpleMemberAccessExpression", receiver: expression, name: "AsReference", typeArguments: [type] },
        arguments: [],
      };
    }
    case "integer-refinement": {
      const type = renderRequiredTargetType(input.scope.typeParameterNames, node, targetType, diagnostics);
      return type === undefined ? undefined : { kind: "CastExpression", type, expression };
    }
    case "cast": {
      const type = renderRequiredTargetType(input.scope.typeParameterNames, node, targetType, diagnostics);
      const operand = selection.proof === "nullable" && sourceType !== undefined && targetType !== undefined &&
          requiredTypeEmission(input, sourceType, node).nullableReference && !requiredTypeEmission(input, targetType, node).nullable
        ? { kind: "PostfixUnaryExpression" as const, operand: expression, operatorToken: { kind: "ExclamationToken" as const } }
        : expression;
      return type === undefined
        ? undefined
        : {
            kind: "CastExpression",
            type,
            expression: operand,
          };
    }
    case "delegate-adapter":
      return planCsharpDelegateAdapter(
        node,
        sourceFile,
        input,
        diagnostics,
        sourceType,
        targetType,
        selection,
        expression,
        applyCsharpConversionSelection,
        callable,
      );
    case "provider-argument-adapter":
      return applyProviderArgumentAdapter(
        node,
        sourceFile,
        input,
        diagnostics,
        sourceType,
        targetType,
        selection,
        expression,
      );
    case "lifted-provider-argument-adapter":
      return applyLiftedProviderArgumentAdapter(
        node,
        input,
        selection,
        expression,
      );
    case "js-value-box":
      return planCsharpJsValueBox(
        node,
        input,
        diagnostics,
        sourceType,
        expression,
      );
    case "js-value-cast":
      return invokeStaticGeneric(
        input.scope.typeParameterNames,
        selection.runtimeUnionArms === undefined
          ? csharpTsValueTargetType()
          : csharpTsUnionTargetType(),
        "CastDynamic",
        selection.runtimeUnionArms ?? (targetType === undefined ? [] : [targetType]),
        expression,
        node,
        diagnostics,
      );
    case "ambiguous":
    case "rejected":
      return failCsharpPlannerInvariant(`C# conversion reached planning after pre-seal refusal: ${selection.reason}`, node);
  }
}

function applyLiftedProviderArgumentAdapter(
  node: Node,
  input: CsharpPlanningContext,
  selection: Extract<
    CsharpConversionSelection,
    { readonly kind: "lifted-provider-argument-adapter" }
  >,
  expression: CsharpExpression,
): CsharpExpression | undefined {
  const sourceElement = csharpTypeFromTargetTypeRef(selection.sourceElementType, input.scope.typeParameterNames);
  const targetElement = csharpTypeFromTargetTypeRef(selection.targetElementType, input.scope.typeParameterNames);
  const declaringType = csharpTypeFromTargetTypeRef(
    selection.adapter.declaringType, input.scope.typeParameterNames,
  );
  if (
    sourceElement === undefined ||
    targetElement === undefined ||
    declaringType === undefined
  ) {
    return failCsharpPlannerInvariant(
      `Exact lifted provider argument adapter '${selection.adapter.id}' requires renderable source, result, and declaring types.`,
      node);
  }
  if (input.program.records.generatedHelper.get("lifted-provider-argument-adapter") === undefined)
    failCsharpPlannerInvariant("An admitted lifted provider argument adapter requires its sealed helper demand.", node);
  return {
    kind: "InvocationExpression",
    callee: {
      kind: "SimpleMemberAccessExpression",
      receiver: qualifiedCsharpType(
        csharpGeneratedHelperNamespace,
        csharpGeneratedConversionHelperName,
      ),
      name: "LiftNullable",
      typeArguments: [sourceElement, targetElement],
    },
    arguments: [
      { kind: "Argument", expression },
      {
        kind: "Argument",
        expression: {
          kind: "SimpleMemberAccessExpression",
          receiver: declaringType,
          name: selection.adapter.targetName,
        },
      },
    ],
  };
}

function applyProviderArgumentAdapter(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  sourceType: TargetTypeRef | undefined,
  targetType: TargetTypeRef | undefined,
  selection: Extract<
    CsharpConversionSelection,
    { readonly kind: "provider-argument-adapter" }
  >,
  expression: CsharpExpression,
): CsharpExpression | undefined {
  const adapterInput = applyCsharpConversionSelection(
    node,
    sourceFile,
    input,
    diagnostics,
    sourceType,
    selection.adapter.inputType,
    selection.sourceToInput,
    expression,
  );
  if (adapterInput === undefined) {
    return undefined;
  }
  const declaringType = csharpTypeFromTargetTypeRef(
    selection.adapter.declaringType, input.scope.typeParameterNames,
  );
  if (declaringType === undefined) {
    return failCsharpPlannerInvariant(
      `Exact provider argument adapter '${selection.adapter.id}' requires a renderable declaring type.`,
      node);
  }
  const adapted: CsharpExpression = {
    kind: "InvocationExpression",
    callee: {
      kind: "SimpleMemberAccessExpression",
      receiver: declaringType,
      name: selection.adapter.targetName,
    },
    arguments: [{ kind: "Argument", expression: adapterInput }],
  };
  return applyCsharpConversionSelection(
    node,
    sourceFile,
    input,
    diagnostics,
    selection.adapter.resultType,
    targetType,
    selection.resultToTarget,
    adapted,
  );
}

function applyRuntimeUnionArmConversion(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  sourceType: TargetTypeRef | undefined,
  targetType: TargetTypeRef | undefined,
  selection: Extract<
    CsharpConversionSelection,
    { readonly kind: "implicit"; readonly proof: "runtime-union-arm" }
  >,
  expression: CsharpExpression,
): CsharpExpression | undefined {
  const optional = targetType === undefined ? undefined : requiredTypeEmission(input, targetType, node).optionalStorage;
  const declaringType = optional === undefined
    ? undefined
    : csharpTypeFromTargetTypeRef(optional.kind === "generic" ? optional.operations : optional.present, input.scope.typeParameterNames);
  if (declaringType === undefined) {
    return failCsharpPlannerInvariant(
      "C# runtime-union construction requires one exact source arm and a renderable closed union carrier.",
      node);
  }
  const convertedExpression = applyCsharpConversionSelection(
    node,
    sourceFile,
    input,
    diagnostics,
    sourceType,
    selection.armType,
    selection.sourceToArm,
    expression,
  );
  if (convertedExpression === undefined) {
    return undefined;
  }
  return {
    kind: "InvocationExpression",
    callee: {
      kind: "SimpleMemberAccessExpression",
      receiver: declaringType,
      name: `From${selection.armIndex + 1}`,
    },
    arguments: [{ kind: "Argument", expression: convertedExpression }],
  };
}

function invokeStaticGeneric(
  typeParameterNames: ReadonlyMap<string, string> | undefined,
  declaringTargetType: TargetTypeRef,
  memberName: string,
  targetTypeArguments: readonly TargetTypeRef[],
  expression: CsharpExpression,
  node: Node,
  _diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  const declaringType = csharpTypeFromTargetTypeRef(declaringTargetType, typeParameterNames);
  const typeArguments = targetTypeArguments.map(type => csharpTypeFromTargetTypeRef(type, typeParameterNames));
  if (
    declaringType === undefined ||
    typeArguments.some((type) => type === undefined)
  ) {
    return failCsharpPlannerInvariant(
      `C# JS-value conversion '${memberName}' requires renderable declaring and generic target types.`,
      node);
  }
  return {
    kind: "InvocationExpression",
    callee: {
      kind: "SimpleMemberAccessExpression",
      receiver: declaringType,
      name: memberName,
      ...(typeArguments.length === 0
        ? {}
        : { typeArguments: typeArguments as readonly CsharpTypeNode[] }),
    },
    arguments: [{ kind: "Argument", expression }],
  };
}

function renderRequiredTargetType(
  typeParameterNames: ReadonlyMap<string, string> | undefined,
  node: Node,
  targetType: TargetTypeRef | undefined,
  _diagnostics: TargetDiagnostic[],
): CsharpTypeNode | undefined {
  const type = targetType === undefined
    ? undefined
    : csharpTypeFromTargetTypeRef(targetType, typeParameterNames);
  if (type === undefined) {
    return failCsharpPlannerInvariant(
      "C# conversion requires a renderable target type.",
      node);
  }
  return type;
}

function requiredTypeEmission(input: CsharpPlanningContext, carrier: TargetTypeRef, node: Node) {
  return input.program.records.typeEmission.get(carrier)
    ?? failCsharpPlannerInvariant("An admitted conversion requires its sealed native carrier representation.", node);
}

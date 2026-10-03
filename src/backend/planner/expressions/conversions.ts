import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpConversionMode,
  CsharpConversionSelection,
} from "../../../analysis/conversions/index.js";
import type {
  TargetTypeRef,
} from "../../../target-model/types/index.js";
import {
  csharpTsUnionTargetType,
  csharpTsValueTargetType,
  getCsharpNullableElementTargetType,
  getCsharpGenericOptionalParts,
  getCsharpRuntimeUnionArms,
  isCsharpNullableReferenceTargetType,
  targetTypeRefEquals,
  isCsharpAbsenceTargetType,
} from "../../../target-model/types/index.js";
import type {
  CsharpExpression,
  CsharpTypeNode,
} from "../../target-ast/roslyn/index.js";
import {
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../types/target-types.js";
import {
  qualifiedCsharpType,
} from "../types/index.js";
import {
  csharpGeneratedConversionHelperName,
  csharpGeneratedHelperNamespace,
} from "../artifacts/generated-helpers.js";
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
import { csharpUnsignedIntegerCounterpart } from "../../../target-model/conversions/integer-refinement.js";
import { planCsharpDelegateAdapter } from "./delegate-adapters.js";
import { planCsharpAbsentValue } from "./optional-storage.js";

export function readCsharpConversionClassification(
  node: Node,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  sourceType: TargetTypeRef | undefined,
  targetType: TargetTypeRef | undefined,
  mode: CsharpConversionMode,
): CsharpConversionSelection | undefined {
  const selection = input.program.conversions.select(
    sourceType,
    targetType,
    mode,
  );
  if (selection === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "C# planning requires a sealed target conversion classification that analysis did not produce.",
    ));
  }
  return selection;
}

export function readCsharpExpressionConversionClassification(
  node: Node,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  sourceType: TargetTypeRef | undefined,
  targetType: TargetTypeRef | undefined,
  mode: CsharpConversionMode,
): CsharpConversionSelection | undefined {
  const selection = input.program.conversions.selectExpression(
    node,
    sourceType,
    targetType,
    mode,
  );
  if (selection === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "C# planning requires a sealed expression-conversion classification that analysis did not produce.",
    ));
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
    case "integer-truncation": {
      const type = renderRequiredTargetType(input.scope.typeParameterNames, node, targetType, diagnostics);
      if (type === undefined) return undefined;
      if (expression.kind !== "InvocationExpression" || expression.arguments.length !== 2) {
        diagnostics.push(unsupportedNodeDiagnostic(node,
          "A native integer truncation requires its exact classified two-argument invocation."));
        return undefined;
      }
      return {
        kind: "CastExpression", type,
        expression: {
          ...expression,
          callee: {
            kind: "SimpleMemberAccessExpression",
            receiver: qualifiedCsharpType("Tsonic.CSharp.Js", "BigIntOps"),
            name: selection.signed ? "AsIntNative" : "AsUintNative",
          },
        },
      };
    }
    case "identity":
      return expression;
    case "absence": {
      const source = sourceType === undefined ? undefined
        : csharpTypeFromTargetTypeRef(sourceType, input.scope.typeParameterNames);
      const absent = targetType === undefined ? undefined
        : planCsharpAbsentValue(targetType, input.scope.typeParameterNames);
      if (!isCsharpAbsenceTargetType(sourceType) || source === undefined || absent === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(node,
          "An absence conversion requires its exact source and destination storage contracts."));
        return undefined;
      }
      return expression.kind === "DefaultExpression" ||
        expression.kind === "LiteralExpression" && expression.value === null ? absent : {
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
      if (selection.proof === "literal") {
        const literal = planCsharpExactLiteralConversion(input, node, targetType);
        if (literal.kind === "resolved") {
          return literal.expression;
        }
        if (literal.kind === "rejected") {
          diagnostics.push(unsupportedNodeDiagnostic(node, literal.reason));
          return undefined;
        }
        if (literal.kind === "source-representation") {
          return expression;
        }
        diagnostics.push(unsupportedNodeDiagnostic(
          node,
          "A selected C# literal conversion requires an exact target literal representation.",
        ));
        return undefined;
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
      return {
        kind: "SimpleMemberAccessExpression",
        receiver: selection.asserted
          ? { kind: "PostfixUnaryExpression", operand: expression, operatorToken: { kind: "ExclamationToken" } }
          : expression,
        name: "Value",
      };
    case "runtime-union-projection":
      return planCsharpRuntimeUnionProjection(node, sourceType, targetType, selection, expression, diagnostics, input);
    case "nullable-map": {
      const sourceElement = getCsharpNullableElementTargetType(sourceType);
      const targetElement = getCsharpNullableElementTargetType(targetType);
      if (sourceElement === undefined || targetElement === undefined ||
        !targetTypeRefEquals(sourceElement, selection.sourceElement) ||
        !targetTypeRefEquals(targetElement, selection.targetElement)) {
        diagnostics.push(unsupportedNodeDiagnostic(node,
          "Nullable conversion requires its exact sealed source and destination element carriers."));
        return undefined;
      }
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
      const arms = getCsharpRuntimeUnionArms(sourceType, input.program.typeDefinitions);
      if (targetType === undefined || arms === undefined || arms.length !== selection.arms.length ||
        !arms.every((arm, index) => {
          const selected = selection.arms[index];
          return selected !== undefined && targetTypeRefEquals(arm, selected);
        }) ||
        !targetTypeRefEquals(targetType, selection.target)) {
        diagnostics.push(unsupportedNodeDiagnostic(node,
          "Runtime-union reference projection conflicts with its exact selected arms and destination."));
        return undefined;
      }
      const type = renderRequiredTargetType(input.scope.typeParameterNames, node, getCsharpNullableElementTargetType(targetType) ?? targetType, diagnostics);
      return type === undefined ? undefined : {
        kind: "InvocationExpression",
        callee: { kind: "SimpleMemberAccessExpression", receiver: expression, name: "AsReference", typeArguments: [type] },
        arguments: [],
      };
    }
    case "integer-refinement": {
      if (sourceType?.kind !== "source-primitive" || targetType?.kind !== "source-primitive" ||
        sourceType.name !== selection.source || targetType.name !== selection.target ||
        selection.proof !== "nonnegative" || csharpUnsignedIntegerCounterpart(selection.source) !== selection.target) {
        diagnostics.push(unsupportedNodeDiagnostic(node, "Integer refinement conflicts with its exact native carriers."));
        return undefined;
      }
      const type = renderRequiredTargetType(input.scope.typeParameterNames, node, targetType, diagnostics);
      return type === undefined ? undefined : { kind: "CastExpression", type, expression };
    }
    case "cast": {
      const type = renderRequiredTargetType(input.scope.typeParameterNames, node, targetType, diagnostics);
      return type === undefined
        ? undefined
        : {
            kind: "CastExpression",
            type,
            expression,
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
        diagnostics,
        sourceType,
        targetType,
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
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        selection.reason,
        selection.candidateIds.map((id) => `candidate: ${id}`),
      ));
      return undefined;
    case "rejected":
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        selection.reason,
      ));
      return undefined;
  }
}

function applyLiftedProviderArgumentAdapter(
  node: Node,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  sourceType: TargetTypeRef | undefined,
  targetType: TargetTypeRef | undefined,
  selection: Extract<
    CsharpConversionSelection,
    { readonly kind: "lifted-provider-argument-adapter" }
  >,
  expression: CsharpExpression,
): CsharpExpression | undefined {
  const sourceElementType = getCsharpNullableElementTargetType(sourceType);
  const targetElementType = getCsharpNullableElementTargetType(targetType);
  if (
    sourceType === undefined ||
    targetType === undefined ||
    sourceElementType === undefined ||
    targetElementType === undefined ||
    isCsharpNullableReferenceTargetType(sourceType) ||
    isCsharpNullableReferenceTargetType(targetType) ||
    !targetTypeRefEquals(sourceElementType, selection.sourceElementType) ||
    !targetTypeRefEquals(targetElementType, selection.targetElementType) ||
    !targetTypeRefEquals(sourceElementType, selection.adapter.inputType) ||
    !targetTypeRefEquals(selection.adapter.resultType, targetElementType)
  ) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      `Exact provider argument adapter '${selection.adapter.id}' cannot be lifted without matching nullable value-carrier element types.`,
    ));
    return undefined;
  }
  const sourceElement = csharpTypeFromTargetTypeRef(sourceElementType, input.scope.typeParameterNames);
  const targetElement = csharpTypeFromTargetTypeRef(targetElementType, input.scope.typeParameterNames);
  const declaringType = csharpTypeFromTargetTypeRef(
    selection.adapter.declaringType, input.scope.typeParameterNames,
  );
  if (
    sourceElement === undefined ||
    targetElement === undefined ||
    declaringType === undefined
  ) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      `Exact lifted provider argument adapter '${selection.adapter.id}' requires renderable source, result, and declaring types.`,
    ));
    return undefined;
  }
  const helper = input.artifacts.requireGeneratedHelper(
    "lifted-provider-argument-adapter",
  );
  if (helper.kind === "rejected") {
    diagnostics.push(unsupportedNodeDiagnostic(node, helper.reason));
    return undefined;
  }
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
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      `Exact provider argument adapter '${selection.adapter.id}' requires a renderable input.`,
    ));
    return undefined;
  }
  const declaringType = csharpTypeFromTargetTypeRef(
    selection.adapter.declaringType, input.scope.typeParameterNames,
  );
  if (declaringType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      `Exact provider argument adapter '${selection.adapter.id}' requires a renderable declaring type.`,
    ));
    return undefined;
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
  const unionType = getCsharpNullableElementTargetType(targetType) ?? targetType;
  const arms = getCsharpRuntimeUnionArms(unionType, input.program.typeDefinitions);
  const selectedArm = arms?.[selection.armIndex];
  const optional = getCsharpGenericOptionalParts(targetType);
  const declaringType = unionType === undefined
    ? undefined
    : csharpTypeFromTargetTypeRef(optional?.operations ?? unionType, input.scope.typeParameterNames);
  if (
    selectedArm === undefined ||
    !targetTypeRefEquals(selectedArm, selection.armType) ||
    declaringType === undefined
  ) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "C# runtime-union construction requires one exact source arm and a renderable closed union carrier.",
    ));
    return undefined;
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
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  const declaringType = csharpTypeFromTargetTypeRef(declaringTargetType, typeParameterNames);
  const typeArguments = targetTypeArguments.map(type => csharpTypeFromTargetTypeRef(type, typeParameterNames));
  if (
    declaringType === undefined ||
    typeArguments.some((type) => type === undefined)
  ) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      `C# JS-value conversion '${memberName}' requires renderable declaring and generic target types.`,
    ));
    return undefined;
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
  diagnostics: TargetDiagnostic[],
): CsharpTypeNode | undefined {
  const type = targetType === undefined
    ? undefined
    : csharpTypeFromTargetTypeRef(targetType, typeParameterNames);
  if (type === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "C# conversion requires a renderable target type.",
    ));
  }
  return type;
}

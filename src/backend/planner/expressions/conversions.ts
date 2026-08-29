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
  getCsharpRuntimeUnionArms,
  getCsharpDelegateSignature,
  isCsharpNullableReferenceTargetType,
  targetTypeRefEquals,
} from "../../../target-model/types/index.js";
import type {
  CsharpArgument,
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
import {
  planCsharpJsValueBox,
} from "./js-value-operations.js";

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
    case "identity":
      return expression;
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
    case "nullable-value":
      return {
        kind: "SimpleMemberAccessExpression",
        receiver: expression,
        name: "Value",
      };
    case "runtime-union-projection":
      return {
        kind: "InvocationExpression",
        callee: {
          kind: "SimpleMemberAccessExpression",
          receiver: expression,
          name: `As${selection.armIndex + 1}`,
        },
        arguments: [],
      };
    case "cast": {
      const type = renderRequiredTargetType(node, targetType, diagnostics);
      return type === undefined
        ? undefined
        : {
            kind: "CastExpression",
            type,
            expression,
          };
    }
    case "delegate-adapter":
      return applyDelegateAdapter(
        node,
        sourceFile,
        input,
        diagnostics,
        sourceType,
        targetType,
        selection,
        expression,
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
  const sourceElement = csharpTypeFromTargetTypeRef(sourceElementType);
  const targetElement = csharpTypeFromTargetTypeRef(targetElementType);
  const declaringType = csharpTypeFromTargetTypeRef(
    selection.adapter.declaringType,
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
    selection.adapter.declaringType,
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
  const arms = getCsharpRuntimeUnionArms(targetType);
  const selectedArm = arms?.[selection.armIndex];
  const declaringType = targetType === undefined
    ? undefined
    : csharpTypeFromTargetTypeRef(targetType);
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

function applyDelegateAdapter(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  sourceType: TargetTypeRef | undefined,
  targetType: TargetTypeRef | undefined,
  selection: Extract<CsharpConversionSelection, { readonly kind: "delegate-adapter" }>,
  expression: CsharpExpression,
): CsharpExpression | undefined {
  const sourceSignature = getCsharpDelegateSignature(sourceType);
  const targetSignature = getCsharpDelegateSignature(targetType);
  if (
    sourceSignature === undefined ||
    targetSignature === undefined ||
    sourceSignature.parameters.length > targetSignature.parameters.length ||
    selection.parameterConversions.length !== sourceSignature.parameters.length
  ) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "C# delegate adaptation requires exact source and target delegate signatures.",
    ));
    return undefined;
  }
  const parameters = targetSignature.parameters.map((parameterType, index) => {
    const type = csharpTypeFromTargetTypeRef(parameterType);
    return type === undefined
      ? undefined
      : {
          kind: "Parameter" as const,
          name: `__tsonic_arg${index}`,
          type,
        };
  });
  if (parameters.some((parameter) => parameter === undefined)) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "C# delegate adaptation requires renderable exact target parameter types.",
    ));
    return undefined;
  }
  const arguments_: CsharpArgument[] = [];
  for (let index = 0; index < sourceSignature.parameters.length; index += 1) {
    const parameter = parameters[index]!;
    const converted = applyCsharpConversionSelection(
      node,
      sourceFile,
      input,
      diagnostics,
      targetSignature.parameters[index],
      sourceSignature.parameters[index],
      selection.parameterConversions[index]!,
      { kind: "IdentifierName", name: parameter.name },
    );
    if (converted === undefined) {
      return undefined;
    }
    arguments_.push({ kind: "Argument", expression: converted });
  }
  let callableExpression = expression;
  if (expression.kind === "LambdaExpression") {
    if (sourceType === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        "C# delegate adaptation requires an exact source delegate type for an authored lambda.",
      ));
      return undefined;
    }
    const sourceDelegateType = csharpTypeFromTargetTypeRef(sourceType);
    if (sourceDelegateType === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        "C# delegate adaptation requires a renderable exact source delegate type for an authored lambda.",
      ));
      return undefined;
    }
    callableExpression = {
      kind: "CastExpression",
      type: sourceDelegateType,
      expression,
    };
  }
  const invocation: CsharpExpression = {
    kind: "InvocationExpression",
    callee: callableExpression,
    arguments: arguments_,
  };
  const body = applyCsharpConversionSelection(
    node,
    sourceFile,
    input,
    diagnostics,
    sourceSignature.returnType,
    targetSignature.returnType,
    selection.returnConversion,
    invocation,
  );
  if (body === undefined) {
    return undefined;
  }
  return {
    kind: "LambdaExpression",
    parameters: parameters as NonNullable<(typeof parameters)[number]>[],
    body,
  };
}

function invokeStaticGeneric(
  declaringTargetType: TargetTypeRef,
  memberName: string,
  targetTypeArguments: readonly TargetTypeRef[],
  expression: CsharpExpression,
  node: Node,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  const declaringType = csharpTypeFromTargetTypeRef(declaringTargetType);
  const typeArguments = targetTypeArguments.map(csharpTypeFromTargetTypeRef);
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
  node: Node,
  targetType: TargetTypeRef | undefined,
  diagnostics: TargetDiagnostic[],
): CsharpTypeNode | undefined {
  const type = targetType === undefined
    ? undefined
    : csharpTypeFromTargetTypeRef(targetType);
  if (type === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "C# conversion requires a renderable target type.",
    ));
  }
  return type;
}

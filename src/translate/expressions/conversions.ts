import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpConversionSelection,
} from "../../policy/conversions/index.js";
import type {
  TargetTypeRef,
} from "../../policy/types/index.js";
import {
  csharpTsUnionTargetType,
  csharpTsValueTargetType,
  getCsharpRuntimeUnionArms,
  getCsharpDelegateSignature,
  isSourceOwnedCallableRuntimeCarrierSubject,
  targetTypeRefEquals,
} from "../../policy/types/index.js";
import type {
  CsharpExpression,
  CsharpTypeNode,
} from "../../backend/roslyn/syntax.js";
import {
  unsupportedNodeDiagnostic,
} from "../../backend/planner/diagnostics.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../../backend/planner/target-types.js";
import type {
  CsharpTranslationContext,
} from "../context/index.js";

export function applyCsharpConversionSelection(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
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
        expression,
      );
    case "compat-box":
      return invokeStaticGeneric(
        csharpTsValueTargetType(),
        "from",
        sourceType === undefined ? [] : [sourceType],
        expression,
        node,
        diagnostics,
      );
    case "compat-cast":
      return invokeStaticGeneric(
        selection.runtimeUnionArms === undefined
          ? csharpTsValueTargetType()
          : csharpTsUnionTargetType(),
        "CastCompat",
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
      diagnostics.push(unsupportedNodeDiagnostic(node, selection.reason));
      return undefined;
  }
}

function applyRuntimeUnionArmConversion(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
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
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  sourceType: TargetTypeRef | undefined,
  targetType: TargetTypeRef | undefined,
  expression: CsharpExpression,
): CsharpExpression | undefined {
  const sourceSignature = getCsharpDelegateSignature(sourceType);
  const targetSignature = getCsharpDelegateSignature(targetType);
  if (
    sourceSignature === undefined ||
    targetSignature === undefined ||
    sourceSignature.parameters.length !== targetSignature.parameters.length
  ) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "C# delegate adaptation requires exact source and target delegate signatures.",
    ));
    return undefined;
  }
  if (!isSourceOwnedCallableRuntimeCarrierSubject(node, sourceFile, input)) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "C# delegate adaptation requires a source-owned callable; provider-owned delegate conversion requires provider conversion metadata.",
    ));
    return undefined;
  }
  const parameters = targetSignature.parameters.map((_, index) => ({
    kind: "Parameter" as const,
    name: `__tsonic_arg${index}`,
  }));
  return {
    kind: "LambdaExpression",
    parameters,
    body: {
      kind: "InvocationExpression",
      callee: expression,
      arguments: parameters.map((parameter) => ({
        kind: "Argument" as const,
        expression: {
          kind: "IdentifierName" as const,
          name: parameter.name,
        },
      })),
    },
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
      `C# compatibility conversion '${memberName}' requires renderable declaring and generic target types.`,
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

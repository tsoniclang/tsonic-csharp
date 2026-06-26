import {
  AsCallExpression,
} from "../source-ast.js";
import type {
  Node,
  SourceFile,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  TargetCompileInput,
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpArgument,
  CsharpExpression,
  CsharpTypeNode,
} from "../../roslyn/syntax.js";
import {
  getCsharpTypeForNode,
} from "../csharp-types.js";
import {
  getSourceCallTypeParameterSubstitutions,
  substituteCsharpTypeNode,
} from "../csharp-type-node/source-generic-types.js";
import {
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";
import {
  getCallableSemanticOwnership,
  pushMissingTargetFactDiagnostic,
} from "../semantic-guards.js";
import type {
  CallArgumentPlanner,
  ExpressionPlanner,
} from "../expression-planner-types.js";
import {
  planSelectedTargetCallee,
  planSelectedTargetCallArguments,
} from "../expression-selected-target-members.js";
import type {
  CsharpTargetOperationFact,
} from "../../../source/csharp-facts.js";
import {
  getRequiredCsharpTargetMemberOperationForSelectedSignature,
  getRequiredCsharpTargetOperationForSelectedSignature,
} from "../csharp-target-operations.js";
import {
  missingCarrierDiagnosticDetail,
  probeCarrierFromResolution,
} from "../runtime-carriers.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../target-types.js";
import {
  tryPlanCompatRuntimeCall,
} from "../compat-runtime-operations.js";

export function planCallExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planCallArgument: CallArgumentPlanner,
): CsharpExpression | undefined {
  const expression = AsCallExpression(node)!;
  const compatDiagnosticsStart = diagnostics.length;
  const compatRuntimeCall = tryPlanCompatRuntimeCall(node, expression.Expression, expression.Arguments?.Nodes ?? [], sourceFile, input, diagnostics, planExpression);
  if (compatRuntimeCall !== undefined) {
    return compatRuntimeCall;
  }
  if (diagnostics.length > compatDiagnosticsStart) {
    return undefined;
  }
  const ownership = getCallableSemanticOwnership(expression.Expression, sourceFile, input);
  const selectedTargetCall = input.facts.getSelectedTargetCall(node);
  if (selectedTargetCall !== undefined) {
    const targetOperation = getRequiredCsharpTargetOperationForSelectedSignature(input, node, selectedTargetCall, diagnostics, "C# call emission");
    if (targetOperation?.kind === "array-creation") {
      return planNativeArrayCreationCall(node, expression, targetOperation, selectedTargetCall, sourceFile, input, diagnostics, planCallArgument);
    }
    const csharpOperation = getRequiredCsharpTargetMemberOperationForSelectedSignature(input, node, selectedTargetCall, diagnostics, "C# call emission");
    if (csharpOperation === undefined) {
      return undefined;
    }
    const member = csharpOperation.selectedMember;
    if (member === undefined) {
      return undefined;
    }
    const callee = planSelectedTargetCallee(expression.Expression, csharpOperation, sourceFile, input, diagnostics, planExpression);
    const arguments_ = planSelectedTargetCallArguments(expression.Expression, expression, member, csharpOperation.argumentArrayLiteralElementTypes, sourceFile, input, diagnostics, planCallArgument);
    if (callee === undefined || arguments_ === undefined) {
      return undefined;
    }
    return {
      kind: "InvocationExpression",
      callee,
      arguments: arguments_,
    };
  }
  if (ownership.requiresTargetFact || !ownership.sourceOwned) {
    pushMissingTargetFactDiagnostic(diagnostics, node, "C# call emission requires a source-owned callable or a selected target signature fact.", ownership);
    return undefined;
  }
  const callee = planSourceOwnedCallCallee(node, expression.Expression!, sourceFile, input, diagnostics, planExpression);
  const arguments_ = planSourceOwnedCallArguments(node, expression.Arguments?.Nodes ?? [], sourceFile, input, diagnostics, planCallArgument);
  if (callee === undefined || arguments_ === undefined) {
    return undefined;
  }
  return {
    kind: "InvocationExpression",
    callee,
    arguments: arguments_,
  };
}

function planSourceOwnedCallArguments(
  call: Node,
  argumentsNodes: readonly (Node | undefined)[],
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planCallArgument: CallArgumentPlanner,
): readonly CsharpArgument[] | undefined {
  const planned: CsharpArgument[] = [];
  let index = 0;
  for (const argument of argumentsNodes) {
    if (argument === undefined) {
      continue;
    }
    const expected = getResolvedSourceCallArgumentExpectation(call, argument, index, sourceFile, input, diagnostics);
    if (expected?.kind === "failed") {
      return undefined;
    }
    const plannedArgument = planCallArgument(argument, sourceFile, input, diagnostics, expected?.type, expected?.subject);
    if (plannedArgument === undefined) {
      return undefined;
    }
    planned.push(plannedArgument);
    index += 1;
  }
  return planned;
}

function planSourceOwnedCallCallee(
  callNode: Node,
  calleeNode: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  const callee = planExpression(calleeNode, sourceFile, input, diagnostics);
  if (callee === undefined) {
    return undefined;
  }
  const typeArguments = input.ast.typeArguments(callNode)
    .map((argument) => getCsharpTypeForNode(argument, sourceFile, input, undefined, diagnostics));
  if (typeArguments.length === 0) {
    return callee;
  }
  switch (callee.kind) {
    case "IdentifierName":
    case "QualifiedName":
      return {
        ...callee,
        typeArguments: [...(callee.typeArguments ?? []), ...typeArguments],
      };
    case "SimpleMemberAccessExpression":
    case "ConditionalAccessExpression":
      return {
        ...callee,
        typeArguments: [...(callee.typeArguments ?? []), ...typeArguments],
      };
    default:
      diagnostics.push(unsupportedNodeDiagnostic(callNode, "Source-owned generic call emission requires a callee that can carry finalized C# type arguments."));
      return undefined;
  }
}

function planNativeArrayCreationCall(
  node: Node,
  expression: NonNullable<ReturnType<typeof AsCallExpression>>,
  operation: Extract<CsharpTargetOperationFact, { readonly kind: "array-creation" }>,
  selectedTargetCall: NonNullable<ReturnType<TargetCompileInput["facts"]["getSelectedTargetCall"]>>,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planCallArgument: CallArgumentPlanner,
): CsharpExpression | undefined {
  const lengthArgumentNode = expression.Arguments?.Nodes?.[operation.lengthArgumentIndex];
  if (lengthArgumentNode === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "C# native array creation requires the finalized length argument."));
    return undefined;
  }
  const elementType = substituteSelectedTargetTypeParameters(operation.elementType, selectedTargetCall);
  const csharpElementType = csharpTypeFromTargetTypeRef(elementType);
  if (csharpElementType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "C# native array creation requires a renderable finalized array element target type."));
    return undefined;
  }
  const size = planCallArgument(lengthArgumentNode, sourceFile, input, diagnostics);
  if (size === undefined) {
    return undefined;
  }
  return {
    kind: "ArrayCreationExpression",
    elementType: csharpElementType,
    size: size.expression,
    elements: [],
  };
}

function substituteSelectedTargetTypeParameters(
  type: TargetTypeRef,
  selectedTargetCall: NonNullable<ReturnType<TargetCompileInput["facts"]["getSelectedTargetCall"]>>,
): TargetTypeRef {
  const substitutions = new Map<string, TargetTypeRef>();
  const typeParameters = selectedTargetCall.member.typeParameters ?? [];
  const typeArguments = selectedTargetCall.targetTypeArguments ?? [];
  for (let index = 0; index < typeParameters.length; index += 1) {
    const parameter = typeParameters[index];
    const argument = typeArguments[index];
    if (parameter !== undefined && argument !== undefined) {
      substitutions.set(parameter.name, argument);
    }
  }
  return substituteTargetTypeParameterReferences(type, substitutions);
}

function substituteTargetTypeParameterReferences(
  type: TargetTypeRef,
  substitutions: ReadonlyMap<string, TargetTypeRef>,
): TargetTypeRef {
  switch (type.kind) {
    case "type-parameter":
      return substitutions.get(type.name) ?? type;
    case "target-named":
      return {
        ...type,
        ...(type.typeArguments === undefined ? {} : { typeArguments: type.typeArguments.map((argument) => substituteTargetTypeParameterReferences(argument, substitutions)) }),
      };
    case "array":
      return { ...type, element: substituteTargetTypeParameterReferences(type.element, substitutions) };
    case "tuple":
      return { ...type, elements: type.elements.map((element) => substituteTargetTypeParameterReferences(element, substitutions)) };
    case "pointer":
      return { ...type, pointee: substituteTargetTypeParameterReferences(type.pointee, substitutions) };
    case "function-pointer":
      return {
        ...type,
        args: type.args.map((argument) => substituteTargetTypeParameterReferences(argument, substitutions)),
        result: substituteTargetTypeParameterReferences(type.result, substitutions),
      };
    case "associated-type":
      return { ...type, owner: substituteTargetTypeParameterReferences(type.owner, substitutions) };
    case "source-primitive":
    case "opaque":
    case "lifetime":
    case "target-specific":
      return type;
  }
}

function getResolvedSourceCallArgumentExpectation(
  call: Node,
  argument: Node,
  argumentIndex: number,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): { readonly kind?: "expectation"; readonly type?: CsharpTypeNode; readonly subject?: Node } | { readonly kind: "failed" } | undefined {
  const sourceCall = AsCallExpression(call);
  const declaration = input.analysis.getResolvedCallParameterDeclarations(call, { sourceFile })?.[argumentIndex];
  const declarationType = getNodeType(declaration);
  const substitutedDeclarationType = getSubstitutedSourceCallParameterType(call, sourceCall, declarationType, sourceFile, input);
  if (substitutedDeclarationType !== undefined) {
    return {
      type: substitutedDeclarationType,
      subject: declarationType ?? declaration,
    };
  }
  const parameterCarrierResolution = input.targetFacts.resolveCallParameterRuntimeCarriers(call, { sourceFile });
  if (parameterCarrierResolution.kind === "resolved-parameters") {
    const carrierResolution = parameterCarrierResolution.parameters[argumentIndex];
    const carrier = probeCarrierFromResolution(carrierResolution);
    if (carrier === undefined && declaration !== undefined) {
      const detail = missingCarrierDiagnosticDetail(carrierResolution, "Parameter runtime carrier fact is missing for the TSTS-selected source call parameter.");
      diagnostics.push(unsupportedNodeDiagnostic(argument, `Source-owned call argument emission requires a finalized parameter carrier fact: ${detail.reason}`, detail.evidence));
      return { kind: "failed" };
    }
    if (carrier === undefined) {
      return undefined;
    }
    const targetType = csharpTypeFromTargetTypeRef(carrier);
    if (targetType !== undefined) {
      return { type: targetType, subject: declarationType ?? declaration };
    }
    diagnostics.push(unsupportedNodeDiagnostic(argument, "Source-owned call argument emission requires a renderable finalized parameter carrier fact."));
    return { kind: "failed" };
  }
  if (declaration !== undefined) {
    const detail = missingCarrierDiagnosticDetail(parameterCarrierResolution, "Parameter carrier resolution is missing for the TSTS-selected source call signature.");
    diagnostics.push(unsupportedNodeDiagnostic(argument, `Source-owned call argument emission requires finalized parameter carrier facts: ${detail.reason}`, detail.evidence));
    return { kind: "failed" };
  }
  return undefined;
}

function getSubstitutedSourceCallParameterType(
  callNode: Node,
  call: ReturnType<typeof AsCallExpression>,
  declarationType: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): CsharpTypeNode | undefined {
  if (call === undefined || declarationType === undefined) {
    return undefined;
  }
  const sourceReference = input.analysis.getProjectSourceReferenceForNode(call.Expression, { sourceFile });
  if (sourceReference === undefined) {
    return undefined;
  }
  const substitutions = getSourceCallTypeParameterSubstitutions(
    callNode,
    call,
    sourceReference.declaration,
    sourceFile,
    input,
    getCsharpTypeForNode,
  );
  if (substitutions.size === 0) {
    return undefined;
  }
  const declarationSourceFile = input.ast.getSourceFile(declarationType) ?? sourceReference.sourceFile;
  return substituteCsharpTypeNode(
    getCsharpTypeForNode(declarationType, declarationSourceFile, input),
    substitutions,
  );
}

function getNodeType(node: Node | undefined): Node | undefined {
  return (node as { readonly Type?: Node } | undefined)?.Type;
}

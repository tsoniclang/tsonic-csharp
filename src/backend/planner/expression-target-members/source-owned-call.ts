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
  AsCallExpression,
  AsPropertyAccessExpression,
  HasSourceKind,
  KindPropertyAccessExpression,
} from "../source-ast.js";
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
import type {
  CallArgumentPlanner,
  ExpressionPlanner,
} from "../expression-planner-types.js";
import {
  getTargetTypeRefForNode,
  getTargetTypeRefForType,
  missingCarrierDiagnosticDetail,
  probeCarrierFromResolution,
} from "../runtime-carriers.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../target-types.js";
import {
  substituteTargetTypeParameters,
} from "../../../source/csharp-source-semantics/target-types.js";
import {
  inferSelectedTargetTypeParameters,
} from "../../../source/csharp-source-semantics/target-member-arguments/type-matching/type-parameter-inference.js";
import {
  planIdentifierName,
} from "../names.js";
import {
  isCsharpSourceOwnedSelectedSignature,
} from "../../../source/csharp-source-semantics/source-owned-selected-signature.js";
import {
  targetTypeRefIsClosed,
} from "../../../source/csharp-source-semantics/target-ref-utils.js";
import {
  asSemanticType,
} from "../../../source/fact-subjects.js";

export function planSourceOwnedCallArguments(
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
    const plannedArgument = planCallArgument(argument, sourceFile, input, diagnostics, expected?.type, expected?.subject, expected?.targetType);
    if (plannedArgument === undefined) {
      return undefined;
    }
    planned.push(plannedArgument);
    index += 1;
  }
  return planned;
}

export function planSourceOwnedCallCallee(
  callNode: Node,
  calleeNode: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  const callee = planSourceOwnedSelectedMemberCallCallee(callNode, calleeNode, sourceFile, input, diagnostics, planExpression) ??
    planExpression(calleeNode, sourceFile, input, diagnostics);
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

function planSourceOwnedSelectedMemberCallCallee(
  callNode: Node,
  calleeNode: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  if (!isCsharpSourceOwnedSelectedSignature(input.facts.getSelectedTargetCall(callNode)) ||
    !HasSourceKind(input.ast, calleeNode, KindPropertyAccessExpression)) {
    return undefined;
  }
  const property = AsPropertyAccessExpression(calleeNode);
  if (property?.Expression === undefined || property.name === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(callNode, "Source-owned member call emission requires a checked property-access callee with a receiver and member name."));
    return undefined;
  }
  const receiver = planExpression(property.Expression, sourceFile, input, diagnostics);
  if (receiver === undefined) {
    return undefined;
  }
  return {
    kind: property.QuestionDotToken === undefined ? "SimpleMemberAccessExpression" : "ConditionalAccessExpression",
    receiver,
    name: planIdentifierName(property.name, "InvalidSourceOwnedCallMemberName", input, diagnostics, "Source-owned call member name"),
  };
}

function getResolvedSourceCallArgumentExpectation(
  call: Node,
  argument: Node,
  argumentIndex: number,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): { readonly kind?: "expectation"; readonly type?: CsharpTypeNode; readonly subject?: Node; readonly targetType?: TargetTypeRef } | { readonly kind: "failed" } | undefined {
  const contextualExpectation = getContextualArgumentExpectation(argument, sourceFile, input, diagnostics);
  if (contextualExpectation !== undefined) {
    return contextualExpectation;
  }
  const sourceCall = AsCallExpression(call);
  const declaration = input.analysis.getResolvedCallParameterDeclarations(call, { sourceFile })?.[argumentIndex];
  const declarationType = getNodeType(declaration);
  const substitutedDeclarationType = getSubstitutedSourceCallParameterType(call, sourceCall, declarationType, sourceFile, input);
  const selectedSourceCallDeclaration = sourceCall === undefined
    ? undefined
    : input.analysis.getProjectSourceReferenceForNode(sourceCall.Expression, { sourceFile })?.declaration;
  const targetSubstitutions = sourceCall === undefined || selectedSourceCallDeclaration === undefined
    ? new Map<string, TargetTypeRef>()
    : getSourceCallTargetTypeParameterSubstitutions(call, sourceCall, selectedSourceCallDeclaration, sourceFile, input);
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
    const substitutedCarrier = substituteTargetTypeParameters(carrier, targetSubstitutions);
    const targetType = csharpTypeFromTargetTypeRef(substitutedCarrier);
    if (targetType !== undefined) {
      return {
        type: substitutedDeclarationType ?? targetType,
        subject: declarationType ?? declaration,
        targetType: substitutedCarrier,
      };
    }
    diagnostics.push(unsupportedNodeDiagnostic(argument, "Source-owned call argument emission requires a renderable finalized parameter carrier fact."));
    return { kind: "failed" };
  }
  if (declaration !== undefined) {
    const detail = missingCarrierDiagnosticDetail(parameterCarrierResolution, "Parameter carrier resolution is missing for the TSTS-selected source call signature.");
    diagnostics.push(unsupportedNodeDiagnostic(argument, `Source-owned call argument emission requires finalized parameter carrier facts: ${detail.reason}`, detail.evidence));
    return { kind: "failed" };
  }
  if (substitutedDeclarationType !== undefined) {
    const targetType = getTargetTypeRefForNode(input, declarationType ?? declaration, sourceFile);
    return {
      type: substitutedDeclarationType,
      subject: declarationType ?? declaration,
      targetType: targetType === undefined ? undefined : substituteTargetTypeParameters(targetType, targetSubstitutions),
    };
  }
  return undefined;
}

function getContextualArgumentExpectation(
  argument: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): { readonly kind?: "expectation"; readonly type?: CsharpTypeNode; readonly subject?: Node; readonly targetType?: TargetTypeRef } | { readonly kind: "failed" } | undefined {
  const contextualFact = input.facts.getContextualTargetTypeFact(argument);
  const contextualTargetType = getConcreteContextualTargetType(argument, sourceFile, input, contextualFact?.targetType, contextualFact?.type);
  if (contextualTargetType === undefined) {
    return undefined;
  }
  if (!targetTypeRefIsClosed(contextualTargetType)) {
    return undefined;
  }
  const type = csharpTypeFromTargetTypeRef(contextualTargetType);
  if (type === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(argument, "Source-owned call argument contextual target fact requires a renderable C# target type before emission."));
    return { kind: "failed" };
  }
  return {
    type,
    targetType: contextualTargetType,
  };
}

function getConcreteContextualTargetType(
  argument: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  recordedTargetType: TargetTypeRef | undefined,
  recordedType: unknown,
): TargetTypeRef | undefined {
  const semanticTargetType = getTargetTypeRefForType(input, asSemanticType(recordedType), sourceFile) ??
    getTargetTypeRefForType(input, input.analysis.getTypeAtLocation(argument, { sourceFile }), sourceFile);
  if (semanticTargetType !== undefined && (recordedTargetType === undefined || !targetTypeRefIsClosed(recordedTargetType))) {
    return semanticTargetType;
  }
  return recordedTargetType ?? semanticTargetType;
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

function getSourceCallTargetTypeParameterSubstitutions(
  callNode: Node,
  call: NonNullable<ReturnType<typeof AsCallExpression>>,
  selectedDeclaration: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): ReadonlyMap<string, TargetTypeRef> {
  const substitutions = new Map<string, TargetTypeRef>();
  const callee = AsPropertyAccessExpression(call.Expression);
  const receiver = callee?.Expression;
  if (receiver !== undefined) {
    const receiverType = getTargetTypeRefForNode(input, receiver, sourceFile);
    addTargetTypeParameterSubstitutions(input, substitutions, input.ast.parent(selectedDeclaration), getTargetTypeArguments(receiverType));
  }
  const explicitTypeArguments = input.ast.typeArguments(callNode)
    .filter((argument): argument is Node => argument !== undefined)
    .map((argument) => getTargetTypeRefForNode(input, argument, sourceFile))
    .filter((argument): argument is TargetTypeRef => argument !== undefined);
  if (explicitTypeArguments.length > 0) {
    addTargetTypeParameterSubstitutions(input, substitutions, selectedDeclaration, explicitTypeArguments);
  }
  addInferredTargetTypeParameterSubstitutions(callNode, call, selectedDeclaration, sourceFile, input, substitutions);
  return substitutions;
}

function addInferredTargetTypeParameterSubstitutions(
  callNode: Node,
  call: NonNullable<ReturnType<typeof AsCallExpression>>,
  selectedDeclaration: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  substitutions: Map<string, TargetTypeRef>,
): void {
  const parameterCarriers = input.targetFacts.resolveCallParameterRuntimeCarriers(callNode, { sourceFile });
  const argumentsNodes = call.Arguments?.Nodes ?? [];
  if (parameterCarriers.kind === "resolved-parameters") {
    for (let index = 0; index < parameterCarriers.parameters.length; index += 1) {
      const expected = probeCarrierFromResolution(parameterCarriers.parameters[index]);
      const argument = argumentsNodes[index];
      const actual = argument === undefined ? undefined : getTargetTypeRefForNode(input, argument, sourceFile);
      if (expected !== undefined && actual !== undefined) {
        inferSelectedTargetTypeParameters(expected, actual, substitutions);
      }
    }
  }
  const declarationSourceFile = input.ast.getSourceFile(selectedDeclaration) ?? sourceFile;
  const declarationReturn = probeCarrierFromResolution(input.targetFacts.resolveDeclarationReturnCarrier(selectedDeclaration, { sourceFile: declarationSourceFile }));
  const callReturn = probeCarrierFromResolution(input.targetFacts.resolveCallReturnRuntimeCarrier(callNode, { sourceFile }));
  if (declarationReturn !== undefined && callReturn !== undefined) {
    inferSelectedTargetTypeParameters(declarationReturn, callReturn, substitutions);
  }
}

function addTargetTypeParameterSubstitutions(
  input: TargetCompileInput,
  substitutions: Map<string, TargetTypeRef>,
  declaration: Node | undefined,
  typeArguments: readonly TargetTypeRef[],
): void {
  if (declaration === undefined || typeArguments.length === 0) {
    return;
  }
  const typeParameters = input.ast.typeParameters(declaration);
  for (let index = 0; index < typeParameters.length; index += 1) {
    const name = input.ast.text(input.ast.name(typeParameters[index]));
    const typeArgument = typeArguments[index];
    if (name.length > 0 && typeArgument !== undefined) {
      substitutions.set(name, typeArgument);
    }
  }
}

function getTargetTypeArguments(type: TargetTypeRef | undefined): readonly TargetTypeRef[] {
  return type?.kind === "target-named" ? type.typeArguments ?? [] : [];
}

function getNodeType(node: Node | undefined): Node | undefined {
  return (node as { readonly Type?: Node } | undefined)?.Type;
}

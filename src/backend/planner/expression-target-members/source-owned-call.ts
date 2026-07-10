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
  AsPropertyAccessExpression,
  HasSourceKind,
  KindPropertyAccessExpression,
} from "../source-ast.js";
import {
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";
import type {
  CallArgumentPlanner,
  ExpressionPlanner,
} from "../expression-planner-types.js";
import {
  getTargetTypeRefForType,
  missingCarrierDiagnosticDetail,
  probeCarrierFromResolution,
} from "../runtime-carriers.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../target-types.js";
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
import {
  planProjectSourceModuleMemberReference,
} from "../expression-source-references.js";

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
  const selectedCall = input.facts.getSelectedTargetCall(callNode);
  const selectedTargetTypeArguments = isCsharpSourceOwnedSelectedSignature(selectedCall)
    ? selectedCall?.targetTypeArguments
    : undefined;
  const typeArguments = selectedTargetTypeArguments?.map(csharpTypeFromTargetTypeRef) ?? [];
  if (typeArguments.some((argument) => argument === undefined)) {
    diagnostics.push(unsupportedNodeDiagnostic(callNode, "Source-owned generic call emission requires every TSTS-selected method type argument to carry a renderable finalized C# target type fact."));
    return undefined;
  }
  if (typeArguments.length === 0) {
    return callee;
  }
  switch (callee.kind) {
    case "IdentifierName":
    case "QualifiedName":
      return {
        ...callee,
        typeArguments: [...(callee.typeArguments ?? []), ...typeArguments as CsharpTypeNode[]],
      };
    case "SimpleMemberAccessExpression":
    case "ConditionalAccessExpression":
      return {
        ...callee,
        typeArguments: [...(callee.typeArguments ?? []), ...typeArguments as CsharpTypeNode[]],
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
  const sourceModuleMemberReference = planProjectSourceModuleMemberReference(calleeNode, sourceFile, input, diagnostics);
  if (sourceModuleMemberReference !== undefined) {
    return sourceModuleMemberReference;
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
  const selectedCall = input.facts.getSelectedTargetCall(call);
  const selectedParameter = isCsharpSourceOwnedSelectedSignature(selectedCall)
    ? selectedCall?.member.parameters[argumentIndex]
    : undefined;
  const parameterCarrierResolution = input.targetFacts.resolveCallParameterRuntimeCarriers(call, { sourceFile });
  if (parameterCarrierResolution.kind === "resolved-parameters") {
    const carrierResolution = parameterCarrierResolution.parameters[argumentIndex];
    const carrier = probeCarrierFromResolution(carrierResolution);
    if (carrier === undefined && selectedParameter !== undefined) {
      const detail = missingCarrierDiagnosticDetail(carrierResolution, "Parameter runtime carrier fact is missing for the TSTS-selected source call parameter.");
      diagnostics.push(unsupportedNodeDiagnostic(argument, `Source-owned call argument emission requires a finalized parameter carrier fact: ${detail.reason}`, detail.evidence));
      return { kind: "failed" };
    }
    if (carrier === undefined) {
      return undefined;
    }
    const targetType = csharpTypeFromTargetTypeRef(carrier);
    if (targetType !== undefined) {
      return {
        type: targetType,
        targetType: carrier,
      };
    }
    diagnostics.push(unsupportedNodeDiagnostic(argument, "Source-owned call argument emission requires a renderable finalized parameter carrier fact."));
    return { kind: "failed" };
  }
  if (selectedParameter !== undefined) {
    const detail = missingCarrierDiagnosticDetail(parameterCarrierResolution, "Parameter carrier resolution is missing for the TSTS-selected source call signature.");
    diagnostics.push(unsupportedNodeDiagnostic(argument, `Source-owned call argument emission requires finalized parameter carrier facts: ${detail.reason}`, detail.evidence));
    return { kind: "failed" };
  }
  const contextualExpectation = getContextualArgumentExpectation(argument, sourceFile, input, diagnostics);
  if (contextualExpectation !== undefined) {
    return contextualExpectation;
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

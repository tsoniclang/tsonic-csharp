import type {
  Node,
  SourceFile,
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
  missingCarrierDiagnosticDetail,
  probeCarrierFromResolution,
} from "../runtime-carriers.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../target-types.js";

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
    const plannedArgument = planCallArgument(argument, sourceFile, input, diagnostics, expected?.type, expected?.subject);
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

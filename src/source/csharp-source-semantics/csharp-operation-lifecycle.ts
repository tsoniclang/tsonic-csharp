import {
  runtimeCarrierFactKey,
  selectedTargetSignatureFactKey,
} from "@tsonic/tsts";
import type {
  CheckedCallMappingRequest,
  ExtensionObservationContext,
  Node,
  SelectedTargetSignatureFact,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  csharpTargetOperationFactKey,
} from "../csharp-facts.js";
import {
  getAstReaderChildNodes,
  asNodeSubject,
  getNodeField,
} from "./ast-utils.js";
import {
  csharpTargetOperationFromMember,
} from "./operations.js";
import {
  instantiateSelectedTargetMember,
} from "./selected-target-member-instantiation.js";
import {
  targetMemberIsClosed,
} from "./target-ref-utils.js";
import type {
  CsharpTargetTypeResolutionHost,
} from "./target-type-resolution.js";
import {
  mapCsharpSourceLibraryCheckedCall,
} from "./surfaces/js/calls.js";
import {
  createCsharpJsSurfaceHost,
} from "./operations-provider.js";
import type {
  CsharpOperationsProviderHost,
} from "./operations-provider.js";
import {
  csharpTargetId,
} from "./identity.js";

type CsharpFinalizedCallOperationHost = CsharpTargetTypeResolutionHost & CsharpOperationsProviderHost;

export function recordCsharpSelectedCallOperationFactsBeforeFinalization(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  selectedSurfaceIds: ReadonlySet<string>,
  host: CsharpFinalizedCallOperationHost,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  for (const sourceFile of compiler.getSourceFiles()) {
    if (sourceFile === undefined || sourceFile.IsDeclarationFile === true) {
      continue;
    }
    walkSelectedCallOperationFacts(lifecycleContext, sourceFile, selectedSurfaceIds, host);
  }
}

function walkSelectedCallOperationFacts(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  node: Node | undefined,
  selectedSurfaceIds: ReadonlySet<string>,
  host: CsharpFinalizedCallOperationHost,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined || node === undefined) {
    return;
  }
  for (const child of getCsharpOperationChildNodes(compiler.ast, node)) {
    walkSelectedCallOperationFacts(lifecycleContext, child, selectedSurfaceIds, host);
  }
  if (lifecycleContext.host.facts.get(node, csharpTargetOperationFactKey) !== undefined) {
    return;
  }
  const selectedSignature = lifecycleContext.host.facts.get(node, selectedTargetSignatureFactKey) ??
    getSelectedTargetSignatureFromFinalizedJsSurfaceCall(lifecycleContext, node, selectedSurfaceIds, host);
  if (selectedSignature === undefined) {
    return;
  }
  const declaringTargetType = getSelectedCallDeclaringTargetType(lifecycleContext, node, selectedSignature);
  const member = instantiateSelectedTargetMember(selectedSignature, host, { declaringTargetType });
  if (member === undefined || !targetMemberIsClosed(member)) {
    return;
  }
  lifecycleContext.host.facts.set(
    node,
    selectedTargetSignatureFactKey,
    { member },
    [{ message: "C# selected target signature finalized from checked provider call and provider target identity." }],
  );
  lifecycleContext.host.facts.set(
    node,
    csharpTargetOperationFactKey,
    csharpTargetOperationFromMember(member),
    [{ message: "C# selected call operation finalized from closed TSTS selected target signature." }],
  );
}

function getSelectedCallDeclaringTargetType(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  node: Node,
  selectedSignature: SelectedTargetSignatureFact,
): TargetTypeRef | undefined {
  const member = selectedSignature.member;
  if (member.kind === "constructor" || member.static === true) {
    return member.declaringType;
  }
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined || !compiler.ast.is.IsCallExpression(node)) {
    return member.declaringType;
  }
  const expression = asNodeSubject(getNodeField(node, "Expression"));
  if (expression === undefined || !compiler.ast.is.IsPropertyAccessExpression(expression)) {
    return member.declaringType;
  }
  const receiver = asNodeSubject(getNodeField(expression, "Expression"));
  if (receiver === undefined) {
    return member.declaringType;
  }
  return lifecycleContext.host.factResolver.resolve(receiver, runtimeCarrierFactKey)?.carrier ??
    member.declaringType;
}

function getSelectedTargetSignatureFromFinalizedJsSurfaceCall(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  node: Node,
  selectedSurfaceIds: ReadonlySet<string>,
  host: CsharpFinalizedCallOperationHost,
): SelectedTargetSignatureFact | undefined {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined || !selectedSurfaceIds.has("js") || !compiler.ast.is.IsCallExpression(node)) {
    return undefined;
  }
  const expression = asNodeSubject(getNodeField(node, "Expression"));
  if (expression === undefined || !compiler.ast.is.IsPropertyAccessExpression(expression)) {
    return undefined;
  }
  const receiver = asNodeSubject(getNodeField(expression, "Expression"));
  const propertyName = compiler.ast.text(compiler.ast.name(expression));
  if (receiver === undefined || propertyName.length === 0) {
    return undefined;
  }
  const sourceFile = compiler.ast.getSourceFile(node);
  const receiverType = sourceFile === undefined
    ? undefined
    : compiler.checker.getTypeAtLocation(receiver, { sourceFile });
  const sourceSelectedSignature = sourceFile === undefined
    ? undefined
    : compiler.checker.getResolvedSignature(node, { sourceFile });
  const sourceSelectedDeclaration = (sourceSelectedSignature as { readonly declaration?: Node } | undefined)?.declaration;
  const sourceSelectedDeclarationContainer = sourceSelectedDeclaration?.Parent;
  const context = {
    observation: "operation.mapCheckedCall",
    extensionId: "tsonic.csharp.operations.finalized-js-surface",
    host: lifecycleContext.host,
    facts: lifecycleContext.host.facts,
    factResolver: lifecycleContext.host.factResolver,
    diagnostics: lifecycleContext.host.diagnostics,
    compiler,
  } satisfies ExtensionObservationContext<"operation.mapCheckedCall">;
  const request = {
    call: node,
    callee: expression,
    calleeReceiver: receiver,
    ...(receiverType !== undefined ? { calleeReceiverType: receiverType } : {}),
    ...(receiverType?.symbol !== undefined ? { calleeReceiverTypeSymbol: receiverType.symbol } : {}),
    calleePropertyName: propertyName,
    arguments: compiler.ast.arguments(node).filter((argument): argument is Node => argument !== undefined),
    ...(sourceSelectedSignature !== undefined ? { sourceSelectedSignature } : {}),
    ...(sourceSelectedDeclaration !== undefined ? { sourceSelectedDeclaration } : {}),
    ...(sourceSelectedDeclarationContainer !== undefined ? { sourceSelectedDeclarationContainer } : {}),
    target: csharpTargetId,
  } satisfies CheckedCallMappingRequest;
  const result = mapCsharpSourceLibraryCheckedCall(
    request,
    context,
    createCsharpJsSurfaceHost("tsonic.csharp.operations.finalized-js-surface", host),
  );
  return result?.kind === "accept" ? result.value.selectedSignature : undefined;
}

function getCsharpOperationChildNodes(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): readonly (Node | undefined)[] {
  return Array.from(new Set(getAstReaderChildNodes(ast, node)));
}

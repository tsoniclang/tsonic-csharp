import {
  runtimeCarrierFactKey,
  selectedTargetSignatureFactKey,
} from "@tsonic/tsts";
import type {
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
  resolveTargetBinding,
  resolveTargetBindingForReference,
} from "./provider-bindings.js";
import {
  instantiateSelectedTargetMember,
} from "./selected-target-member-instantiation.js";
import {
  selectTargetMember,
} from "./target-member-selection.js";
import {
  getCsharpTargetTypeFromBinding,
} from "./target-enrichment.js";
import {
  resolveTargetTypeRefForSubject,
} from "./target-type-resolution.js";
import {
  targetMemberIsClosed,
} from "./target-ref-utils.js";
import {
  createRuntimeCarrierLifecycleObservationContext,
} from "./runtime-carrier-context.js";
import type {
  CsharpTargetTypeResolutionHost,
} from "./target-type-resolution.js";

export function recordCsharpSelectedCallOperationFactsBeforeFinalization(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  host: CsharpTargetTypeResolutionHost,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  for (const sourceFile of compiler.getSourceFiles()) {
    if (sourceFile === undefined || sourceFile.IsDeclarationFile === true) {
      continue;
    }
    walkSelectedCallOperationFacts(lifecycleContext, sourceFile, host);
  }
}

function walkSelectedCallOperationFacts(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  node: Node | undefined,
  host: CsharpTargetTypeResolutionHost,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined || node === undefined) {
    return;
  }
  for (const child of getCsharpOperationChildNodes(compiler.ast, node)) {
    walkSelectedCallOperationFacts(lifecycleContext, child, host);
  }
  if (lifecycleContext.host.facts.get(node, csharpTargetOperationFactKey) !== undefined) {
    return;
  }
  const selectedSignature = lifecycleContext.host.facts.get(node, selectedTargetSignatureFactKey) ??
    getSelectedTargetSignatureFromFinalizedProviderOperation(lifecycleContext, node, host);
  if (selectedSignature === undefined) {
    return;
  }
  const declaringTargetType = lifecycleContext.host.factResolver.resolve(node, runtimeCarrierFactKey)?.carrier ??
    selectedSignature.member.declaringType;
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

function getSelectedTargetSignatureFromFinalizedProviderOperation(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  node: Node,
  host: CsharpTargetTypeResolutionHost,
): SelectedTargetSignatureFact | undefined {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return undefined;
  }
  if (compiler.ast.is.IsNewExpression(node)) {
    return getSelectedTargetSignatureFromFinalizedProviderConstruction(lifecycleContext, node, host);
  }
  if (!compiler.ast.is.IsCallExpression(node)) {
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
  const context = createRuntimeCarrierLifecycleObservationContext(lifecycleContext);
  const sourceFile = compiler.ast.getSourceFile(node);
  const receiverType = sourceFile === undefined
    ? undefined
    : compiler.checker.getTypeAtLocation(receiver, { sourceFile });
  const binding = resolveTargetBindingForReference(receiver, context) ??
    resolveTargetBinding(receiverType, context) ??
    resolveTargetBinding(receiverType?.symbol, context);
  if (binding === undefined) {
    return undefined;
  }
  const candidates = (binding.members ?? []).filter((member) =>
    member.sourceName === propertyName &&
    (member.kind === "method" || member.kind === "constructor")
  );
  if (candidates.length === 0) {
    return undefined;
  }
  const member = selectTargetMember(candidates, {
    arguments: compiler.ast.arguments(node).filter((argument): argument is Node => argument !== undefined),
    receiver,
  }, context, (subject, observationContext, options = {}) =>
    resolveTargetTypeRefForSubject(subject, observationContext, options, host));
  return member === undefined ? undefined : { member };
}

function getSelectedTargetSignatureFromFinalizedProviderConstruction(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  node: Node,
  host: CsharpTargetTypeResolutionHost,
): SelectedTargetSignatureFact | undefined {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return undefined;
  }
  const expression = asNodeSubject(getNodeField(node, "Expression"));
  if (expression === undefined) {
    return undefined;
  }
  const context = createRuntimeCarrierLifecycleObservationContext(lifecycleContext);
  const sourceFile = compiler.ast.getSourceFile(node);
  const constructedType = sourceFile === undefined
    ? undefined
    : compiler.checker.getTypeAtLocation(node, { sourceFile });
  const binding = resolveTargetBindingForReference(node, context) ??
    resolveTargetBindingForReference(expression, context) ??
    resolveTargetBinding(constructedType, context) ??
    resolveTargetBinding(constructedType?.symbol, context);
  if (binding === undefined) {
    return undefined;
  }
  const typeArguments = compiler.ast.typeArguments(node)
    .map((argument) => resolveTargetTypeRefForSubject(argument, context, {}, host));
  if (typeArguments.some((argument) => argument === undefined)) {
    return undefined;
  }
  const declaringTargetType = getCsharpTargetTypeFromBinding(binding, typeArguments as readonly TargetTypeRef[], host);
  if (declaringTargetType === undefined) {
    return undefined;
  }
  const candidates = (binding.members ?? [])
    .filter((member) => member.kind === "constructor")
    .map((member) => instantiateSelectedTargetMember({ member }, host, { declaringTargetType }))
    .filter((member): member is NonNullable<typeof member> => member !== undefined);
  if (candidates.length === 0) {
    return undefined;
  }
  const member = selectTargetMember(candidates, {
    arguments: compiler.ast.arguments(node).filter((argument): argument is Node => argument !== undefined),
  }, context, (subject, observationContext, options = {}) =>
    resolveTargetTypeRefForSubject(subject, observationContext, options, host));
  return member === undefined
    ? undefined
    : {
        member: {
          ...member,
          declaringType: declaringTargetType,
          returnType: declaringTargetType,
        },
      };
}

function getCsharpOperationChildNodes(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): readonly (Node | undefined)[] {
  return Array.from(new Set(getAstReaderChildNodes(ast, node)));
}

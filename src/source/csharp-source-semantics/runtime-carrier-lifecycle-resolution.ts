import {
  selectedTargetSignatureFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionObservation,
  ExtensionObservationContext,
  Node,
  RuntimeCarrierFactRequest,
  RuntimeCarrierFactResult,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  csharpTargetId,
} from "./identity.js";
import {
  createRuntimeCarrierLifecycleObservationContext,
} from "./runtime-carrier-context.js";
import {
  mapRuntimeCarrier,
} from "./runtime-carrier-mapping.js";
import type {
  CsharpRuntimeCarrierSemanticsHost,
} from "./runtime-carrier-types.js";

export function getObservedRuntimeCarrierSyntaxTargetTypeRef(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  node: Node,
  host: CsharpRuntimeCarrierSemanticsHost,
): TargetTypeRef | undefined {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined || !compiler.ast.is.IsRegularExpressionLiteral(node)) {
    return undefined;
  }
  const result = resolveCsharpRuntimeCarrierFromLifecycle(lifecycleContext, {
    type: node,
    sourceTypeReference: node,
    target: csharpTargetId,
  }, host);
  return result.kind === "accept" ? result.value.carrier : undefined;
}

export function resolveCsharpRuntimeCarrierFromLifecycle(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  request: RuntimeCarrierFactRequest,
  host: CsharpRuntimeCarrierSemanticsHost,
): ExtensionObservation<RuntimeCarrierFactResult> {
  const context = createRuntimeCarrierLifecycleObservationContext(lifecycleContext);
  return mapRuntimeCarrier(request, context, host);
}

export function getRuntimeCarrierSyntaxTargetTypeRef(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  node: Node,
  host: CsharpRuntimeCarrierSemanticsHost,
): TargetTypeRef | undefined {
  const ast = lifecycleContext.compiler?.ast;
  if (ast === undefined) {
    return undefined;
  }
  if (!ast.is.IsNewExpression(node)) {
    return undefined;
  }
  const selected = lifecycleContext.host.facts.get(node, selectedTargetSignatureFactKey);
  const declaringType = selected?.member.returnType ?? selected?.member.declaringType;
  if (declaringType?.kind !== "target-named") {
    return undefined;
  }
  const typeArguments = ast.typeArguments(node)
    .map((argument) => host.getTargetTypeRefForSyntaxNode(argument, lifecycleContext.host.facts, ast));
  if (typeArguments.some((argument) => argument === undefined)) {
    return undefined;
  }
  return {
    ...declaringType,
    ...(typeArguments.length > 0 ? { typeArguments: typeArguments as readonly TargetTypeRef[] } : {}),
  };
}

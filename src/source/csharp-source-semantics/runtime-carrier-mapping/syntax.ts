import type {
  ExtensionObservationContext,
  RuntimeCarrierFactRequest,
  RuntimeCarrierFactResult,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import {
  instantiatedTargetTypeFactKey,
  providerVirtualDeclarationFactKey,
  targetBindingFactKey,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  isTypeSyntaxNode,
} from "../ast-utils.js";
import type {
  CsharpRuntimeCarrierSemanticsHost,
} from "../runtime-carrier-types.js";
import {
  asType,
} from "../target-ref-utils.js";
import {
  getExactRuntimeCarrierRequestSubjects,
} from "../runtime-carrier-subjects.js";
import {
  csharpTargetTypeFromBinding,
} from "../target-types.js";

export function isAnyRuntimeCarrierType(
  type: Type | undefined,
  context: ExtensionObservationContext,
): boolean {
  return type !== undefined && context.compiler?.typeShape.isAny(type) === true;
}

export function getTypeSyntaxCarrierFromFinalizedTypeFacts(
  request: RuntimeCarrierFactRequest,
  context: ExtensionObservationContext<"type.resolveRuntimeCarrier">,
  host: CsharpRuntimeCarrierSemanticsHost,
): RuntimeCarrierFactResult["carrier"] | undefined {
  const ast = context.compiler?.ast;
  if (ast === undefined) {
    return undefined;
  }
  for (const subject of getExactRuntimeCarrierRequestSubjects(request)) {
    const node = asNodeSubject(subject);
    if (node !== undefined && isTypeSyntaxNode(ast, node)) {
      const instantiated = context.facts.get(node, instantiatedTargetTypeFactKey) ??
        context.factResolver.resolve(node, instantiatedTargetTypeFactKey);
      const binding = instantiated?.targetType ??
        context.facts.get(node, targetBindingFactKey) ??
        context.factResolver.resolve(node, targetBindingFactKey);
      const providerDeclaration = context.facts.get(node, providerVirtualDeclarationFactKey) ??
        context.factResolver.resolve(node, providerVirtualDeclarationFactKey);
      if (binding !== undefined || providerDeclaration !== undefined) {
        if (binding === undefined) {
          return undefined;
        }
        const typeArguments = instantiated?.resolvedTypeArguments ??
          (instantiated?.typeArguments ?? ast.typeArguments(node)).map((argument) => host.getTargetTypeRefForSubject(argument, context, {
            allowRuntimeCarrier: true,
            allowSemanticTypeQuery: false,
          }));
        if (typeArguments.some((argument) => argument === undefined)) {
          return undefined;
        }
        return csharpTargetTypeFromBinding(binding, typeArguments as readonly TargetTypeRef[]);
      }
      const carrier = host.getTargetTypeRefForSubject(node, context, {
        allowRuntimeCarrier: true,
        allowSemanticTypeQuery: false,
      });
      if (carrier !== undefined) {
        return carrier;
      }
    }
  }
  return undefined;
}

export function isCallableTypeWithoutCarrierEvidence(
  request: RuntimeCarrierFactRequest,
  context: ExtensionObservationContext<"type.resolveRuntimeCarrier">,
): boolean {
  const compiler = context.compiler;
  const type = asType(request.type);
  return compiler !== undefined &&
    type !== undefined &&
    compiler.typeShape.getCallSignatures(type).length > 0;
}

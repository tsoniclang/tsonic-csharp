import {
  acceptObservation,
  deferObservation,
} from "@tsonic/tsts";
import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  Node,
  ExtensionObservation,
  RuntimeCarrierFactRequest,
  RuntimeCarrierFactResult,
  SourceFile,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import {
  asType,
} from "./source-library.js";
import type {
  CsharpJsSurfaceHost,
} from "./source-library.js";
import {
  getSymbolForDeclarationLookup,
} from "../../symbol-utils.js";
import {
  resolveTargetTypeRefFromKeywordTypeSyntax,
} from "../../target-type-keywords.js";
import {
  createCsharpJsCollectionTargetTypeForSourceType,
} from "./collection-target-metadata/index.js";
import {
  collectionPolicyForTargetType,
} from "./collection-target-metadata/definitions.js";
import {
  targetTypeRefIsClosed,
} from "../../target-ref-utils.js";
import {
  setRuntimeCarrierFactIfUnresolved,
} from "../../runtime-carrier-lifecycle/fact-writes.js";

export {
  csharpJsMapTargetType,
  csharpJsSetTargetType,
  collectionTargetMembersForSelectedIdentity,
  collectionTargetTypeForSelectedIdentity,
  getCsharpJsIterableElementType,
  isCsharpJsMapTargetType,
  isCsharpJsSetTargetType,
} from "./collection-target-metadata/index.js";

export function mapCsharpJsCollectionRuntimeCarrier(
  request: RuntimeCarrierFactRequest,
  context: ExtensionObservationContext<"type.resolveRuntimeCarrier">,
  host: CsharpJsSurfaceHost,
): ExtensionObservation<RuntimeCarrierFactResult> {
  const carrier = getCsharpJsCollectionRuntimeCarrierForType(asType(request.type), context, host);
  return carrier === undefined
    ? deferObservation
    : acceptObservation<RuntimeCarrierFactResult>({
        carrier,
      }, [{ message: "C# JS surface collection runtime carrier mapped from checked JavaScript library type and resolved type arguments." }]);
}

export function getCsharpJsCollectionRuntimeCarrierForType(
  type: Type | undefined,
  context: ExtensionObservationContext,
  host: CsharpJsSurfaceHost,
  sourceFile?: SourceFile,
): TargetTypeRef | undefined {
  if (type === undefined) {
    return undefined;
  }
  const typeArguments = getTypeArguments(type, context, sourceFile)
    .map((argument) => host.getTargetTypeRefForSubject(argument, context, {
      allowRuntimeCarrier: true,
      allowSemanticTypeQuery: true,
      ...(sourceFile !== undefined ? { sourceFile } : {}),
    }));
  const completeTypeArguments = completeTargetTypeArguments(typeArguments);
  return completeTypeArguments === undefined
    ? undefined
    : createCsharpJsCollectionTargetTypeForSourceType(type, context, completeTypeArguments);
}

export function recordCsharpJsCollectionRuntimeCarrierFactForNode(
  node: Node,
  sourceFile: SourceFile,
  context: ExtensionObservationContext,
  host: CsharpJsSurfaceHost,
  options: { readonly allowCheckedTypeDerivation?: boolean } = {},
): void {
  const carrier = getCsharpJsCollectionRuntimeCarrierForNode(node, sourceFile, context, host, options);
  if (carrier !== undefined) {
    recordCollectionRuntimeCarrierFact(node, carrier, sourceFile, context);
  }
}

function getCsharpJsCollectionRuntimeCarrierForNode(
  node: Node,
  sourceFile: SourceFile,
  context: ExtensionObservationContext,
  host: CsharpJsSurfaceHost,
  options: { readonly allowCheckedTypeDerivation?: boolean } = {},
): TargetTypeRef | undefined {
  const existingCarrier = getExistingClosedCollectionCarrierForNode(node, sourceFile, context, host);
  if (existingCarrier !== undefined) {
    return existingCarrier;
  }
  const type = checkedTypeAtLocation(node, sourceFile, context);
  const syntaxCarrier = getCsharpJsCollectionRuntimeCarrierForSyntaxNode(node, type, context, host);
  if (syntaxCarrier !== undefined) {
    return syntaxCarrier;
  }
  return options.allowCheckedTypeDerivation === false
    ? undefined
    : getCsharpJsCollectionRuntimeCarrierForType(type, context, host, sourceFile);
}

function getExistingClosedCollectionCarrierForNode(
  node: Node,
  sourceFile: SourceFile,
  context: ExtensionObservationContext,
  host: CsharpJsSurfaceHost,
): TargetTypeRef | undefined {
  const carrier = host.unwrapNullableTargetType(host.getTargetTypeRefForSubject(node, context, {
    allowRuntimeCarrier: true,
    allowSemanticTypeQuery: false,
    sourceFile,
  }));
  return carrier !== undefined && targetTypeRefIsClosed(carrier) && collectionPolicyForTargetType(carrier) !== undefined
    ? carrier
    : undefined;
}

function getCsharpJsCollectionRuntimeCarrierForSyntaxNode(
  node: Node,
  type: Type | undefined,
  context: ExtensionObservationContext,
  host: CsharpJsSurfaceHost,
): TargetTypeRef | undefined {
  const ast = context.compiler?.ast;
  if (ast === undefined || type === undefined) {
    return undefined;
  }
  if (!ast.is.IsNewExpression(node) && !ast.is.IsTypeReferenceNode(node)) {
    return undefined;
  }
  const typeArguments = getExplicitTypeArgumentNodes(node, context)
    .map((argument) => argument === undefined
      ? undefined
      : resolveTargetTypeRefFromKeywordTypeSyntax(ast, argument) ??
        host.getTargetTypeRefForSubject(argument, context, {
          allowRuntimeCarrier: true,
          allowSemanticTypeQuery: true,
          sourceFile: ast.getSourceFile(node),
        })
    );
  if (typeArguments.some((argument) => argument === undefined)) {
    return undefined;
  }
  const completeTypeArguments = completeTargetTypeArguments(typeArguments);
  return completeTypeArguments === undefined
    ? undefined
    : createCsharpJsCollectionTargetTypeForSourceType(type, context, completeTypeArguments);
}

function checkedTypeAtLocation(
  node: Node,
  sourceFile: SourceFile,
  context: ExtensionObservationContext,
): Type | undefined {
  return context.compiler?.checker.getTypeAtLocation(node, { sourceFile });
}

function recordCollectionRuntimeCarrierFact(
  node: Node,
  carrier: TargetTypeRef,
  sourceFile: SourceFile,
  context: ExtensionObservationContext,
): void {
  const fact = { carrier };
  const evidence = [{ message: "C# JS surface collection runtime carrier recorded from checked TypeScript Map/Set library type." }];
  setCollectionRuntimeCarrierFactIfAbsent(node, fact, evidence, context);
  const symbol = context.compiler === undefined
    ? undefined
    : getSymbolForDeclarationLookup(context.compiler.ast, context.compiler.checker, node, sourceFile);
  setCollectionRuntimeCarrierFactIfAbsent(symbol, fact, evidence, context);
}

function setCollectionRuntimeCarrierFactIfAbsent(
  subject: ExtensionFactSubject | undefined,
  fact: { readonly carrier: TargetTypeRef },
  evidence: readonly { readonly message: string }[],
  context: ExtensionObservationContext,
): void {
  setRuntimeCarrierFactIfUnresolved(context, subject, fact, evidence);
}

function completeTargetTypeArguments(
  typeArguments: readonly (TargetTypeRef | undefined)[],
): readonly TargetTypeRef[] | undefined {
  return typeArguments.some((argument) => argument === undefined || !targetTypeRefIsClosed(argument))
    ? undefined
    : typeArguments as readonly TargetTypeRef[];
}

function getTypeArguments(type: Type, context: ExtensionObservationContext, sourceFile?: SourceFile): readonly Type[] {
  const types = context.compiler?.typeShape;
  if (types === undefined || !types.isTypeReference(type)) {
    return [];
  }
  return types.getTypeArguments(type, sourceFile === undefined ? undefined : { sourceFile })
    .filter((argument): argument is Type => argument !== undefined);
}

function getExplicitTypeArgumentNodes(
  node: Node,
  context: ExtensionObservationContext,
): readonly Node[] {
  return context.compiler?.ast.typeArguments(node)
    .filter((argument): argument is Node => argument !== undefined) ?? [];
}

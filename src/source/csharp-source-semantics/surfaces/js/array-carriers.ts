import type {
  ExtensionObservation,
  ExtensionObservationContext,
  Node,
  RuntimeCarrierFactRequest,
  RuntimeCarrierFactResult,
  SourceFile,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import {
  acceptObservation,
  deferObservation,
  runtimeCarrierFactKey,
} from "@tsonic/tsts";
import {
  asType,
  resolveSourceLibraryMemberIdentity,
} from "./source-library.js";
import type {
  CsharpJsSurfaceHost,
} from "./source-library.js";
import {
  asNodeSubject,
  getNodeField,
  visitAstReaderNodes,
} from "../../ast-utils.js";
import {
  createRuntimeCarrierLifecycleObservationContext,
} from "../../runtime-carriers.js";
import {
  getSymbolForDeclarationLookup,
} from "../../symbol-utils.js";
import {
  getCsharpCollectionElementTargetType,
  isCsharpDenseMutableCollectionTargetType,
  isCsharpReadOnlyIndexableCollectionTargetType,
} from "../../target-types.js";
import {
  getCsharpJsIterableElementType,
} from "./collections.js";
import {
  csharpJsSourceLibraryMemberIsArrayConstructor,
} from "./policy.js";
import {
  isSourceStandardLibraryArrayLikeType,
} from "../../source-type-classification.js";
export {
  csharpJsArrayCarrierId,
  csharpJsArrayCarrierTargetType,
  getCsharpJsArrayCarrierElementType,
  isCsharpJsArrayCarrierTargetType,
} from "./array-target-type.js";
import {
  csharpJsArrayCarrierTargetType,
  getCsharpJsArrayCarrierElementType,
  isCsharpJsArrayCarrierTargetType,
} from "./array-target-type.js";

export function getCsharpArrayLikeElementType(type: TargetTypeRef | undefined): TargetTypeRef | undefined {
  return getCsharpJsArrayCarrierElementType(type) ??
    getCsharpJsIterableElementType(type) ??
    getCsharpCollectionElementTargetType(type);
}

export function getCsharpArrayLengthMember(type: TargetTypeRef | undefined): string | undefined {
  if (type?.kind === "array") {
    return "Length";
  }
  if (isCsharpJsArrayCarrierTargetType(type)) {
    return "length";
  }
  if (isCsharpReadOnlyIndexableCollectionTargetType(type) || isCsharpDenseMutableCollectionTargetType(type)) {
    return "Count";
  }
  return undefined;
}

export function mapCsharpJsArrayRuntimeCarrier(
  request: RuntimeCarrierFactRequest,
  context: ExtensionObservationContext<"type.resolveRuntimeCarrier">,
  host: CsharpJsSurfaceHost,
): ExtensionObservation<RuntimeCarrierFactResult> {
  const carrier = getCsharpJsArrayRuntimeCarrierForType(asType(request.type), context, host);
  return carrier === undefined
    ? deferObservation
    : acceptObservation<RuntimeCarrierFactResult>({
        carrier,
      }, [{ message: "C# JS surface Array runtime carrier mapped from checked JavaScript Array type and resolved element target facts." }]);
}

export function getCsharpJsArrayRuntimeCarrierForType(
  type: Type | undefined,
  context: ExtensionObservationContext,
  host: CsharpJsSurfaceHost,
): TargetTypeRef | undefined {
  if (type === undefined || !isSourceStandardLibraryArrayLikeType(type, context)) {
    return undefined;
  }
  const elementType = getTypeArguments(type, context)
    .map((argument) => host.getTargetTypeRefForSubject(argument, context, {
      allowRuntimeCarrier: true,
      allowSemanticTypeQuery: true,
    }))[0];
  return elementType === undefined
    ? undefined
    : csharpJsArrayCarrierTargetType(elementType);
}

export function recordCsharpJsArrayConstructorRuntimeCarrierFactsBeforeFinalization(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  host: CsharpJsSurfaceHost,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  const context = createRuntimeCarrierLifecycleObservationContext(lifecycleContext);
  for (const sourceFile of compiler.getSourceFiles()) {
    if (sourceFile === undefined || sourceFile.IsDeclarationFile === true) {
      continue;
    }
    visitAstReaderNodes(compiler.ast, sourceFile, (node) => {
      if (compiler.ast.is.IsNewExpression(node) !== true || lifecycleContext.host.facts.get(node, runtimeCarrierFactKey) !== undefined) {
        return;
      }
      if (!isCheckedSourceLibraryArrayConstruction(node, sourceFile, context)) {
        return;
      }
      const semanticType = compiler.checker.getTypeAtLocation(node, { sourceFile });
      const carrier = getCsharpJsArrayRuntimeCarrierForType(semanticType, context, host);
      if (carrier === undefined) {
        return;
      }
      const fact = { carrier };
      const evidence = [{ message: "C# JS surface Array constructor runtime carrier recorded from checked TypeScript Array construction type facts." }];
      lifecycleContext.host.facts.set(node, runtimeCarrierFactKey, fact, evidence);
      recordArrayConstructorInitializerRuntimeCarrierFacts(node, sourceFile, fact, evidence, lifecycleContext);
    });
  }
}

function recordArrayConstructorInitializerRuntimeCarrierFacts(
  node: Node,
  sourceFile: SourceFile,
  fact: { readonly carrier: TargetTypeRef },
  evidence: readonly { readonly message: string }[],
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
): void {
  const compiler = lifecycleContext.compiler;
  const parent = compiler?.ast.parent(node);
  if (compiler === undefined || parent === undefined || compiler.ast.kindName(parent) !== "KindVariableDeclaration" || asNodeSubject(getNodeField(parent, "Initializer")) !== node) {
    return;
  }
  lifecycleContext.host.facts.set(parent, runtimeCarrierFactKey, fact, evidence);
  const name = asNodeSubject(getNodeField(parent, "name"));
  if (name === undefined) {
    return;
  }
  lifecycleContext.host.facts.set(name, runtimeCarrierFactKey, fact, evidence);
  const symbol = getSymbolForDeclarationLookup(compiler.ast, compiler.checker, name, sourceFile);
  if (symbol !== undefined) {
    lifecycleContext.host.facts.set(symbol, runtimeCarrierFactKey, fact, evidence);
  }
}

function isCheckedSourceLibraryArrayConstruction(
  node: Node,
  sourceFile: SourceFile,
  context: ExtensionObservationContext,
): boolean {
  const signature = context.compiler?.checker.getResolvedSignature(node, { sourceFile });
  const declaration = asNodeSubject((signature as { readonly declaration?: unknown } | undefined)?.declaration);
  const sourceMember = resolveSourceLibraryMemberIdentity(declaration, context);
  return csharpJsSourceLibraryMemberIsArrayConstructor(sourceMember);
}

function getTypeArguments(type: Type, context: ExtensionObservationContext): readonly Type[] {
  const types = context.compiler?.types;
  if (types === undefined || !types.isTypeReference(type)) {
    return [];
  }
  return types.getTypeArguments(type).filter((argument): argument is Type => argument !== undefined);
}

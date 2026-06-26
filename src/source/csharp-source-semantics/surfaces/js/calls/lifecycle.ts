import {
  ExtensionObservationPoint,
  runtimeCarrierFactKey,
  selectedTargetSignatureFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  Node,
  SourceFile,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  getNodeField,
  getNodeList,
  visitAstReaderNodes,
} from "../../../ast-utils.js";
import {
  createCsharpLifecycleObservationContext,
} from "../../../runtime-carriers.js";
import {
  getSymbolForDeclarationLookup,
} from "../../../symbol-utils.js";
import type {
  CsharpJsSurfaceHost,
} from "../source-library.js";
import {
  getSourceLibraryMember,
} from "../source-library.js";
import {
  csharpJsSourceLibraryMemberIsArrayConstructor,
  csharpJsSourceLibraryMemberIsCollection,
} from "../policy.js";
import {
  getCsharpJsArrayRuntimeCarrierForType,
} from "../array-carriers.js";
import {
  recordCsharpJsCollectionRuntimeCarrierFactForNode,
} from "../collections.js";
import {
  getNodeParent,
  getPropertyAccessName,
  getSignatureDeclaration,
} from "./declaration-identity.js";
import {
  mapCsharpSourceLibraryCheckedCall,
} from "./dispatch.js";

export function recordCsharpSourceLibraryCallFactsBeforeFinalization(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  host: CsharpJsSurfaceHost,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  const context = createCsharpLifecycleObservationContext(lifecycleContext, ExtensionObservationPoint.mapCheckedCall);
  for (const sourceFile of compiler.getSourceFiles()) {
    if (sourceFile === undefined || sourceFile.IsDeclarationFile === true) {
      continue;
    }
    const checkedCallNodes: Node[] = [];
    visitAstReaderNodes(compiler.ast, sourceFile, (node) => {
      if (compiler.ast.is.IsCallExpression(node) || compiler.ast.is.IsNewExpression(node)) {
        checkedCallNodes.push(node);
      }
    });
    const innerFirst = checkedCallNodes.reverse();
    for (const node of innerFirst) {
      recordCsharpSourceLibraryCallFact(node, sourceFile, context, host, "checking");
    }
    for (const node of innerFirst) {
      recordCsharpSourceLibraryCallFact(node, sourceFile, context, host, "finalization");
    }
  }
}

function recordCsharpSourceLibraryCallFact(
  node: Node,
  sourceFile: SourceFile,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
  phase: "checking" | "finalization",
): void {
  const compiler = context.compiler;
  if (
    compiler === undefined ||
    (!compiler.ast.is.IsCallExpression(node) && !compiler.ast.is.IsNewExpression(node)) ||
    context.host.facts.get(node, selectedTargetSignatureFactKey) !== undefined
  ) {
    return;
  }
  const callee = asNodeSubject(getNodeField(node, "Expression"));
  if (callee === undefined) {
    return;
  }
  const sourceSelectedSignature = compiler.checker.getResolvedSignature(node, { sourceFile }) as ExtensionFactSubject | undefined;
  const sourceSelectedDeclaration = getSignatureDeclaration(sourceSelectedSignature);
  const sourceMember = getSourceLibraryMember(sourceSelectedDeclaration, context);
  if (sourceMember === undefined) {
    return;
  }
  recordArrayConstructorRuntimeCarrierFact(node, sourceFile, sourceMember, context, host);
  const calleeReceiver = compiler.ast.is.IsPropertyAccessExpression(callee)
    ? asNodeSubject(getNodeField(callee, "Expression"))
    : undefined;
  recordCollectionRuntimeCarrierFactsForSelectedCall(node, calleeReceiver, sourceFile, sourceMember, context, host);
  const calleeReceiverSymbol = calleeReceiver === undefined
    ? undefined
    : getSymbolForDeclarationLookup(compiler.ast, compiler.checker, calleeReceiver, sourceFile);
  const calleeReceiverResolvedSymbol = calleeReceiver === undefined
    ? undefined
    : getSymbolForDeclarationLookup(compiler.ast, compiler.checker, calleeReceiver, sourceFile);
  const sourceSelectedDeclarationContainer = getNodeParent(sourceSelectedDeclaration);
  const mapped = mapCsharpSourceLibraryCheckedCall({
    call: node,
    callee,
    ...(calleeReceiver !== undefined ? { calleeReceiver } : {}),
    ...(calleeReceiverSymbol !== undefined ? { calleeReceiverSymbol } : {}),
    ...(calleeReceiverResolvedSymbol !== undefined ? { calleeReceiverResolvedSymbol } : {}),
    ...(getPropertyAccessName(callee, compiler.ast) !== undefined ? { calleePropertyName: getPropertyAccessName(callee, compiler.ast) } : {}),
    arguments: getNodeList(getNodeField(node, "Arguments")),
    ...(sourceSelectedSignature !== undefined ? { sourceSelectedSignature } : {}),
    ...(sourceSelectedDeclaration !== undefined ? { sourceSelectedDeclaration } : {}),
    ...(sourceSelectedDeclarationContainer !== undefined ? { sourceSelectedDeclarationContainer } : {}),
    ...(host.targetId !== undefined ? { target: host.targetId } : {}),
  }, context, host, { phase });
  if (mapped?.kind === "reject") {
    context.diagnostics.append(mapped.diagnostic);
    return;
  }
  if (mapped?.kind !== "accept") {
    return;
  }
  context.host.facts.set(
    node,
    selectedTargetSignatureFactKey,
    mapped.value.selectedSignature,
    mapped.evidence ?? [{ message: "C# JS surface selected target signature recorded from checked TypeScript library call before finalization." }],
  );
}

function recordCollectionRuntimeCarrierFactsForSelectedCall(
  node: Node,
  calleeReceiver: Node | undefined,
  sourceFile: SourceFile,
  sourceMember: NonNullable<ReturnType<typeof getSourceLibraryMember>>,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): void {
  if (!sourceMemberIsCollection(sourceMember)) {
    return;
  }
  if (collectionConstructorSourceMemberIds.has(sourceMember.id)) {
    recordCsharpJsCollectionRuntimeCarrierFactForNode(node, sourceFile, context, host);
    return;
  }
  if (calleeReceiver !== undefined) {
    recordCsharpJsCollectionRuntimeCarrierFactForNode(calleeReceiver, sourceFile, context, host);
  }
}

function sourceMemberIsCollection(
  sourceMember: NonNullable<ReturnType<typeof getSourceLibraryMember>>,
): boolean {
  return csharpJsSourceLibraryMemberIsCollection(sourceMember);
}

const collectionConstructorSourceMemberIds = new Set([
  "Map.constructor",
  "ReadonlyMap.constructor",
  "Set.constructor",
  "ReadonlySet.constructor",
]);

function recordArrayConstructorRuntimeCarrierFact(
  node: Node,
  sourceFile: SourceFile,
  sourceMember: NonNullable<ReturnType<typeof getSourceLibraryMember>>,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): void {
  if (
    !csharpJsSourceLibraryMemberIsArrayConstructor(sourceMember) ||
    context.host.facts.get(node, runtimeCarrierFactKey) !== undefined
  ) {
    return;
  }
  const semanticType = context.compiler?.checker.getTypeAtLocation(node, { sourceFile });
  const carrier = getCsharpJsArrayRuntimeCarrierForType(semanticType, context, host);
  if (carrier === undefined) {
    return;
  }
  context.host.facts.set(node, runtimeCarrierFactKey, { carrier }, [{ message: "C# JS surface Array constructor runtime carrier recorded from checked TypeScript Array construction type facts." }]);
}

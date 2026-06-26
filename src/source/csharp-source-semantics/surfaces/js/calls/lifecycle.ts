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
  TargetTypeRef,
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
  targetTypeRefIsClosed,
} from "../../../target-ref-utils.js";
import {
  getSymbolForDeclarationLookup,
} from "../../../symbol-utils.js";
import type {
  CsharpJsSurfaceHost,
} from "../source-library.js";
import {
  resolveSourceLibraryMemberIdentity,
  sourceLibraryMemberMatches,
} from "../source-library.js";
import {
  collectionConstructorIdentityPolicy,
  csharpJsSourceLibraryMemberIsArrayConstructor,
  csharpJsSourceLibraryMemberIsCollection,
} from "./member-providers.js";
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
  options: { readonly diagnostics?: "append" | "suppress" } = {},
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
      recordCsharpSourceLibraryCallFact(node, sourceFile, context, host, "checking", "suppress");
    }
    let recorded = recordSelectedSourceLibraryCallReturnCarrierFacts(innerFirst, sourceFile, context);
    while (recorded) {
      recorded = false;
      for (const node of innerFirst) {
        recorded = recordCsharpSourceLibraryCallFact(node, sourceFile, context, host, "finalization", "suppress") === "accepted" ||
          recorded;
      }
      recorded = recordSelectedSourceLibraryCallReturnCarrierFacts(innerFirst, sourceFile, context) ||
        recorded;
    }
    if (options.diagnostics !== "suppress") {
      for (const node of innerFirst) {
        recordCsharpSourceLibraryCallFact(node, sourceFile, context, host, "finalization", "append");
      }
    }
  }
}

function recordSelectedSourceLibraryCallReturnCarrierFacts(
  nodes: readonly Node[],
  sourceFile: SourceFile,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): boolean {
  let recorded = false;
  for (const node of nodes) {
    recorded = recordSelectedSourceLibraryCallReturnCarrierFact(
      node,
      sourceFile,
      context.host.facts.get(node, selectedTargetSignatureFactKey)?.member.returnType,
      context,
    ) || recorded;
  }
  return recorded;
}

function recordCsharpSourceLibraryCallFact(
  node: Node,
  sourceFile: SourceFile,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
  phase: "checking" | "finalization",
  diagnostics: "append" | "suppress",
): "accepted" | "pending" | "rejected" {
  const compiler = context.compiler;
  if (
    compiler === undefined ||
    (!compiler.ast.is.IsCallExpression(node) && !compiler.ast.is.IsNewExpression(node)) ||
    context.host.facts.get(node, selectedTargetSignatureFactKey) !== undefined
  ) {
    return "pending";
  }
  const callee = asNodeSubject(getNodeField(node, "Expression"));
  if (callee === undefined) {
    return "pending";
  }
  const sourceSelectedSignature = compiler.checker.getResolvedSignature(node, { sourceFile }) as ExtensionFactSubject | undefined;
  const sourceSelectedDeclaration = getSignatureDeclaration(sourceSelectedSignature);
  const sourceMember = resolveSourceLibraryMemberIdentity(sourceSelectedDeclaration, context);
  if (sourceMember === undefined) {
    return "pending";
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
    if (diagnostics === "append") {
      context.diagnostics.append(mapped.diagnostic);
    }
    return "rejected";
  }
  if (mapped?.kind !== "accept") {
    return "pending";
  }
  context.host.facts.set(
    node,
    selectedTargetSignatureFactKey,
    mapped.value.selectedSignature,
    mapped.evidence ?? [{ message: "C# JS surface selected target signature recorded from checked TypeScript library call before finalization." }],
  );
  recordSelectedSourceLibraryCallReturnCarrierFact(node, sourceFile, mapped.value.selectedSignature.member.returnType, context);
  return "accepted";
}

function recordSelectedSourceLibraryCallReturnCarrierFact(
  node: Node,
  sourceFile: SourceFile,
  returnType: TargetTypeRef | undefined,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): boolean {
  if (returnType === undefined || !targetTypeRefIsClosed(returnType)) {
    return false;
  }
  const fact = { carrier: returnType };
  const message = "C# JS surface runtime carrier recorded from the finalized selected target call return type.";
  let recorded = setRuntimeCarrierFactIfMissing(context, node, fact, message);
  const compiler = context.compiler;
  const parent = compiler?.ast.parent(node);
  if (compiler === undefined || parent === undefined || compiler.ast.kindName(parent) !== "KindVariableDeclaration" || asNodeSubject(getNodeField(parent, "Initializer")) !== node) {
    return recorded;
  }
  recorded = setRuntimeCarrierFactIfMissing(context, parent, fact, message) || recorded;
  const name = asNodeSubject(getNodeField(parent, "name"));
  recorded = setRuntimeCarrierFactIfMissing(context, name, fact, message) || recorded;
  const symbol = name === undefined
    ? undefined
    : getSymbolForDeclarationLookup(compiler.ast, compiler.checker, name, sourceFile);
  recorded = setRuntimeCarrierFactIfMissing(context, symbol, fact, message) || recorded;
  return recorded;
}

function setRuntimeCarrierFactIfMissing(
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  subject: ExtensionFactSubject | undefined,
  fact: { readonly carrier: TargetTypeRef },
  message: string,
): boolean {
  if (subject === undefined || context.host.facts.get(subject, runtimeCarrierFactKey) !== undefined) {
    return false;
  }
  context.host.facts.set(subject, runtimeCarrierFactKey, fact, [{ message }]);
  return true;
}

function recordCollectionRuntimeCarrierFactsForSelectedCall(
  node: Node,
  calleeReceiver: Node | undefined,
  sourceFile: SourceFile,
  sourceMember: NonNullable<ReturnType<typeof resolveSourceLibraryMemberIdentity>>,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): void {
  if (!sourceMemberIsCollection(sourceMember)) {
    return;
  }
  if (sourceLibraryMemberMatches(sourceMember, collectionConstructorIdentityPolicy)) {
    recordCsharpJsCollectionRuntimeCarrierFactForNode(node, sourceFile, context, host);
    return;
  }
  if (calleeReceiver !== undefined) {
    recordCsharpJsCollectionRuntimeCarrierFactForNode(calleeReceiver, sourceFile, context, host);
  }
}

function sourceMemberIsCollection(
  sourceMember: NonNullable<ReturnType<typeof resolveSourceLibraryMemberIdentity>>,
): boolean {
  return csharpJsSourceLibraryMemberIsCollection(sourceMember);
}

function recordArrayConstructorRuntimeCarrierFact(
  node: Node,
  sourceFile: SourceFile,
  sourceMember: NonNullable<ReturnType<typeof resolveSourceLibraryMemberIdentity>>,
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

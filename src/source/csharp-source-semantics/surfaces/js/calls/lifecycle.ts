import {
  ExtensionObservationPoint,
  selectedTargetSignatureFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  Node,
  Signature,
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
  setRuntimeCarrierFactIfUnresolved,
} from "../../../runtime-carrier-lifecycle/fact-writes.js";
import {
  targetTypeRefIsClosed,
} from "../../../target-ref-utils.js";
import type {
  CsharpJsSurfaceHost,
} from "../source-library.js";
import {
  resolveSourceLibraryMemberIdentity,
} from "../source-library.js";
import {
  getCsharpJsSourceLibraryOperationRow,
} from "./member-providers/index.js";
import type {
  JsSurfaceLifecycleRuntimeCarrierFact,
} from "./member-providers/operation-types.js";
import {
  getCsharpJsArrayRuntimeCarrierForNode,
} from "../array-carriers.js";
import {
  recordCsharpJsCollectionRuntimeCarrierFactForNode,
} from "../collections.js";
import {
  getSignatureDeclaration,
} from "./declaration-identity.js";
import {
  getSymbolForDeclarationLookup,
} from "../../../symbol-utils.js";
import {
  csharpTargetOperationFactKey,
} from "../../../../csharp-facts.js";
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
    (
      context.host.facts.get(node, selectedTargetSignatureFactKey) !== undefined &&
      context.host.facts.get(node, csharpTargetOperationFactKey) !== undefined
    )
  ) {
    return "pending";
  }
  const callee = asNodeSubject(getNodeField(node, "Expression"));
  if (callee === undefined) {
    return "pending";
  }
  const sourceSelectedSignature = getResolvedCallSignature(node, sourceFile, context);
  const sourceSelectedDeclaration = getSignatureDeclaration(sourceSelectedSignature, context);
  const sourceReturnType = getSourceReturnTypeForSelectedCall(node, sourceFile, sourceSelectedSignature, context);
  const sourceMember = resolveSourceLibraryMemberIdentity(sourceSelectedDeclaration, context);
  if (sourceMember === undefined) {
    return "pending";
  }
  const calleeReceiver = compiler.ast.is.IsPropertyAccessExpression(callee)
    ? asNodeSubject(getNodeField(callee, "Expression"))
    : undefined;
  recordLifecycleRuntimeCarrierFactsForSelectedCall(node, calleeReceiver, sourceFile, sourceMember, context, host, phase);
  const mapped = mapCsharpSourceLibraryCheckedCall({
    call: node,
    callee,
    arguments: getNodeList(getNodeField(node, "Arguments")),
    ...(sourceSelectedSignature !== undefined ? { sourceSelectedSignature } : {}),
    ...(sourceSelectedDeclaration !== undefined ? { sourceSelectedDeclaration } : {}),
    ...(sourceReturnType !== undefined ? { sourceReturnType } : {}),
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
  if (context.host.facts.get(node, selectedTargetSignatureFactKey) === undefined) {
    context.host.facts.set(
      node,
      selectedTargetSignatureFactKey,
      mapped.value.selectedSignature,
      mapped.evidence ?? [{ message: "C# JS surface selected target signature recorded from checked TypeScript library call before finalization." }],
    );
  }
  recordSelectedSourceLibraryCallReturnCarrierFact(node, sourceFile, mapped.value.selectedSignature.member.returnType, context);
  return "accepted";
}

function getResolvedCallSignature(
  node: Node,
  sourceFile: SourceFile,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): ExtensionFactSubject | undefined {
  try {
    return context.compiler?.checker.getResolvedSignature(node, { sourceFile }) as ExtensionFactSubject | undefined;
  } catch {
    return undefined;
  }
}

function getSourceReturnTypeForSelectedCall(
  node: Node,
  sourceFile: SourceFile,
  sourceSelectedSignature: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): ExtensionFactSubject | undefined {
  const compiler = context.compiler;
  if (compiler === undefined) {
    return undefined;
  }
  try {
    return compiler.ast.is.IsNewExpression(node)
      ? compiler.checker.getTypeAtLocation(node, { sourceFile }) as ExtensionFactSubject | undefined
      : sourceSelectedSignature === undefined
        ? undefined
        : compiler.checker.getReturnTypeOfSignature(sourceSelectedSignature as Signature, { sourceFile }) as ExtensionFactSubject | undefined;
  } catch {
    return undefined;
  }
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
  return setRuntimeCarrierFactIfUnresolved(context, subject, fact, [{ message }]);
}

function recordLifecycleRuntimeCarrierFactsForSelectedCall(
  node: Node,
  calleeReceiver: Node | undefined,
  sourceFile: SourceFile,
  sourceMember: NonNullable<ReturnType<typeof resolveSourceLibraryMemberIdentity>>,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
  phase: "checking" | "finalization",
): void {
  for (const carrierFact of getCsharpJsSourceLibraryOperationRow(sourceMember)?.lifecycleRuntimeCarrierFacts ?? []) {
    recordLifecycleRuntimeCarrierFact(carrierFact, node, calleeReceiver, sourceFile, context, host, phase);
  }
}

function recordLifecycleRuntimeCarrierFact(
  carrierFact: JsSurfaceLifecycleRuntimeCarrierFact,
  node: Node,
  calleeReceiver: Node | undefined,
  sourceFile: SourceFile,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
  phase: "checking" | "finalization",
): void {
  if (carrierFact.subject === "call-result") {
    recordLifecycleRuntimeCarrierFactForSubject(carrierFact.carrier, node, sourceFile, context, host);
    return;
  }
  if (calleeReceiver === undefined) {
    return;
  }
  recordLifecycleRuntimeCarrierFactForSubject(carrierFact.carrier, calleeReceiver, sourceFile, context, host, {
    allowCheckedTypeDerivation: carrierFact.checkedTypeDerivation === "finalization" && phase === "finalization",
  });
}

function recordLifecycleRuntimeCarrierFactForSubject(
  carrier: JsSurfaceLifecycleRuntimeCarrierFact["carrier"],
  subject: Node,
  sourceFile: SourceFile,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
  options: { readonly allowCheckedTypeDerivation?: boolean } = {},
): void {
  switch (carrier) {
    case "array":
      recordArrayLifecycleRuntimeCarrierFact(subject, sourceFile, context, host);
      return;
    case "collection":
      recordCsharpJsCollectionRuntimeCarrierFactForNode(subject, sourceFile, context, host, options);
      return;
  }
}

function recordArrayLifecycleRuntimeCarrierFact(
  subject: Node,
  sourceFile: SourceFile,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): void {
  const carrier = getCsharpJsArrayRuntimeCarrierForNode(subject, sourceFile, context, host);
  if (carrier !== undefined) {
    setRuntimeCarrierFactIfUnresolved(context, subject, { carrier }, [{ message: "C# JS surface Array runtime carrier recorded from selected operation lifecycle metadata and checked TypeScript type facts." }]);
  }
}

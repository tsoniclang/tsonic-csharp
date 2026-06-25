import {
  ExtensionObservationPoint,
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
    for (const node of checkedCallNodes.reverse()) {
      recordCsharpSourceLibraryCallFact(node, sourceFile, context, host);
    }
  }
}

function recordCsharpSourceLibraryCallFact(
  node: Node,
  sourceFile: SourceFile,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
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
  if (getSourceLibraryMember(sourceSelectedDeclaration, context) === undefined) {
    return;
  }
  const calleeReceiver = compiler.ast.is.IsPropertyAccessExpression(callee)
    ? asNodeSubject(getNodeField(callee, "Expression"))
    : undefined;
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
  }, context, host);
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

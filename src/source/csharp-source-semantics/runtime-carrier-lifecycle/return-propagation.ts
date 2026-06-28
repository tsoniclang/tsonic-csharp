import {
  runtimeCarrierFactKey,
} from "@tsonic/tsts";
import type {
  Node,
  SourceFile,
  Type,
} from "@tsonic/tsts";
import {
  createRuntimeCarrierLifecycleObservationContext,
} from "../runtime-carrier-context.js";
import type {
  CsharpRuntimeCarrierSemanticsHost,
} from "../runtime-carrier-types.js";
import type {
  RuntimeCarrierLifecycleFactsContext,
} from "./context.js";
import {
  setRuntimeCarrierFactIfAbsentOrStronger,
} from "./fact-writes.js";

export function recordCsharpDeclarationReturnRuntimeCarrierFacts(
  lifecycleContext: RuntimeCarrierLifecycleFactsContext,
  sourceFile: SourceFile,
  nodes: readonly Node[],
  host: CsharpRuntimeCarrierSemanticsHost,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  const context = createRuntimeCarrierLifecycleObservationContext(lifecycleContext);
  for (const node of nodes) {
    if (!isSourceReturnCarrierDeclaration(node, lifecycleContext)) {
      continue;
    }
    const returnType = getDeclarationReturnType(node, sourceFile, lifecycleContext);
    if (returnType === undefined || lifecycleContext.host.facts.get(returnType, runtimeCarrierFactKey) !== undefined) {
      continue;
    }
    const carrier = host.getTargetTypeRefForType(returnType, context, {
      allowRuntimeCarrier: false,
      sourceFile,
    });
    if (carrier === undefined) {
      continue;
    }
    setRuntimeCarrierFactIfAbsentOrStronger(
      lifecycleContext,
      returnType,
      { carrier },
      "C# declaration return runtime carrier recorded from checked TSTS signature return type.",
    );
  }
}

function getDeclarationReturnType(
  node: Node,
  sourceFile: SourceFile,
  lifecycleContext: RuntimeCarrierLifecycleFactsContext,
): Type | undefined {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return undefined;
  }
  const declarationType = compiler.checker.getTypeAtLocation(node, { sourceFile });
  const name = compiler.ast.name(node);
  const nameType = name === undefined
    ? undefined
    : compiler.checker.getTypeAtLocation(name, { sourceFile });
  const symbol = name === undefined
    ? undefined
    : compiler.checker.getSymbolAtLocation(name, { sourceFile });
  const resolvedSymbol = name === undefined
    ? undefined
    : compiler.checker.getResolvedSymbol(name, { sourceFile });
  const symbolType = symbol === undefined
    ? undefined
    : compiler.checker.getTypeOfSymbol(symbol, { sourceFile });
  const resolvedSymbolType = resolvedSymbol === undefined
    ? undefined
    : compiler.checker.getTypeOfSymbol(resolvedSymbol, { sourceFile });
  const signature = compiler.typeShape.getCallSignatures(declarationType, { sourceFile })[0] ??
    compiler.typeShape.getCallSignatures(nameType, { sourceFile })[0] ??
    compiler.typeShape.getCallSignatures(symbolType, { sourceFile })[0] ??
    compiler.typeShape.getCallSignatures(resolvedSymbolType, { sourceFile })[0];
  return signature === undefined
    ? undefined
    : compiler.typeShape.getReturnTypeOfSignature(signature, { sourceFile });
}

function isSourceReturnCarrierDeclaration(
  node: Node,
  lifecycleContext: RuntimeCarrierLifecycleFactsContext,
): boolean {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return false;
  }
  switch (compiler.ast.kindName(node)) {
    case "KindFunctionDeclaration":
    case "KindMethodDeclaration":
    case "KindGetAccessor":
      return true;
    default:
      return false;
  }
}

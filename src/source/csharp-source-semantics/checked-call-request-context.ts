import type {
  CheckedCallMappingRequest,
  ExtensionFactSubject,
  ExtensionObservationContext,
  Node,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  getNodeField,
  getNodeParent,
  getPropertyAccessName,
} from "./ast-utils.js";
import {
  getAliasedSymbolIfAvailable,
  getSymbolForDeclarationLookup,
} from "./symbol-utils.js";

export interface CsharpCheckedCallRequestContext {
  readonly calleeReceiver?: ExtensionFactSubject;
  readonly calleeReceiverSymbol?: ExtensionFactSubject;
  readonly calleeReceiverResolvedSymbol?: ExtensionFactSubject;
  readonly calleeReceiverAliasedSymbol?: ExtensionFactSubject;
  readonly calleeReceiverType?: ExtensionFactSubject;
  readonly calleeReceiverTypeSymbol?: ExtensionFactSubject;
  readonly calleePropertyName?: string;
  readonly calleeSymbol?: ExtensionFactSubject;
  readonly calleeResolvedSymbol?: ExtensionFactSubject;
  readonly calleeAliasedSymbol?: ExtensionFactSubject;
  readonly sourceSelectedDeclarationContainer?: ExtensionFactSubject;
  readonly sourceSelectedContainerSymbol?: ExtensionFactSubject;
}

export function getCsharpCheckedCallRequestContext(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): CsharpCheckedCallRequestContext {
  const compiler = context.compiler;
  const callee = asNodeSubject(request.callee);
  if (compiler === undefined || callee === undefined) {
    return {};
  }
  const sourceFile = compiler.ast.getSourceFile(callee);
  const calleeSymbol = request.sourceCalleeSymbol ??
    getSymbolForDeclarationLookup(compiler.ast, compiler.checker, callee, sourceFile);
  const calleeResolvedSymbol = getResolvedSymbol(compiler, callee, sourceFile);
  const calleeAliasedSymbol = getAliasedSymbolIfAvailable(compiler.checker, calleeResolvedSymbol ?? calleeSymbol, sourceFile);
  const calleeReceiver = compiler.ast.is.IsPropertyAccessExpression(callee)
    ? asNodeSubject(getNodeField(callee, "Expression"))
    : undefined;
  const receiverSourceFile = calleeReceiver === undefined ? undefined : compiler.ast.getSourceFile(calleeReceiver as Node);
  const calleeReceiverSymbol = calleeReceiver === undefined
    ? undefined
    : getSymbolForDeclarationLookup(compiler.ast, compiler.checker, calleeReceiver as Node, receiverSourceFile);
  const calleeReceiverResolvedSymbol = calleeReceiver === undefined
    ? undefined
    : getResolvedSymbol(compiler, calleeReceiver as Node, receiverSourceFile);
  const calleeReceiverAliasedSymbol = getAliasedSymbolIfAvailable(compiler.checker, calleeReceiverResolvedSymbol ?? calleeReceiverSymbol, receiverSourceFile);
  const calleeReceiverType = calleeReceiver === undefined
    ? undefined
    : compiler.checker.getTypeAtLocation(calleeReceiver as Node, { sourceFile: receiverSourceFile });
  const calleeReceiverTypeSymbol = getTypeSymbol(calleeReceiverType);
  const sourceSelectedDeclaration = asNodeSubject(request.sourceSelectedDeclaration);
  const sourceSelectedDeclarationContainer = getNodeParent(sourceSelectedDeclaration);
  const sourceSelectedContainerSymbol = sourceSelectedDeclarationContainer === undefined
    ? undefined
    : getSymbolForDeclarationLookup(compiler.ast, compiler.checker, sourceSelectedDeclarationContainer, compiler.ast.getSourceFile(sourceSelectedDeclarationContainer));
  return {
    ...(calleeReceiver !== undefined ? { calleeReceiver } : {}),
    ...(calleeReceiverSymbol !== undefined ? { calleeReceiverSymbol } : {}),
    ...(calleeReceiverResolvedSymbol !== undefined ? { calleeReceiverResolvedSymbol } : {}),
    ...(calleeReceiverAliasedSymbol !== undefined ? { calleeReceiverAliasedSymbol } : {}),
    ...(calleeReceiverType !== undefined ? { calleeReceiverType } : {}),
    ...(calleeReceiverTypeSymbol !== undefined ? { calleeReceiverTypeSymbol } : {}),
    ...(getPropertyAccessName(callee, compiler.ast) !== undefined ? { calleePropertyName: getPropertyAccessName(callee, compiler.ast) } : {}),
    ...(calleeSymbol !== undefined ? { calleeSymbol } : {}),
    ...(calleeResolvedSymbol !== undefined ? { calleeResolvedSymbol } : {}),
    ...(calleeAliasedSymbol !== undefined ? { calleeAliasedSymbol } : {}),
    ...(sourceSelectedDeclarationContainer !== undefined ? { sourceSelectedDeclarationContainer } : {}),
    ...(sourceSelectedContainerSymbol !== undefined ? { sourceSelectedContainerSymbol } : {}),
  };
}

function getResolvedSymbol(
  compiler: NonNullable<ExtensionObservationContext["compiler"]>,
  node: Node,
  sourceFile: ReturnType<NonNullable<ExtensionObservationContext["compiler"]>["ast"]["getSourceFile"]> | undefined,
): ExtensionFactSubject | undefined {
  try {
    return compiler.checker.getResolvedSymbolOrNil(node, { sourceFile }) ?? undefined;
  } catch {
    return undefined;
  }
}

function getTypeSymbol(type: ExtensionFactSubject | undefined): ExtensionFactSubject | undefined {
  if (type === undefined) {
    return undefined;
  }
  const symbol = (type as { readonly Symbol?: unknown; readonly symbol?: unknown }).Symbol ??
    (type as { readonly symbol?: unknown }).symbol;
  return symbol !== undefined && symbol !== null && typeof symbol === "object" ? symbol : undefined;
}

import type {
  CheckedCallMappingRequest,
  ExtensionFactSubject,
  ExtensionObservationContext,
  Node,
  Type,
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
  readonly calleeSelectedPropertySymbol?: ExtensionFactSubject;
  readonly calleeSelectedPropertyDeclaration?: ExtensionFactSubject;
  readonly calleeSelectedPropertyDeclarationContainer?: ExtensionFactSubject;
  readonly calleeSelectedPropertyContainerSymbol?: ExtensionFactSubject;
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
    return {
      ...(request.sourceCalleeSymbol !== undefined ? { calleeSelectedPropertySymbol: request.sourceCalleeSymbol } : {}),
      ...(request.sourceCalleeDeclaration !== undefined ? { calleeSelectedPropertyDeclaration: request.sourceCalleeDeclaration } : {}),
    };
  }
  const sourceFile = compiler.ast.getSourceFile(callee);
  const calleeSymbol = request.sourceCalleeSymbol;
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
    : getTypeAtLocation(compiler, calleeReceiver as Node, receiverSourceFile);
  const calleeReceiverTypeSymbol = calleeReceiverType === undefined
    ? undefined
    : getTypeSymbol(compiler, calleeReceiverType as Type);
  const calleePropertyName = getPropertyAccessName(callee, compiler.ast);
  const calleeSelectedPropertySymbol = request.sourceCalleeSymbol;
  const calleeSelectedPropertyDeclaration = asNodeSubject(request.sourceCalleeDeclaration);
  const calleeSelectedPropertyDeclarationContainer = getNodeParent(calleeSelectedPropertyDeclaration);
  const calleeSelectedPropertyContainerSymbol = calleeSelectedPropertyDeclarationContainer === undefined
    ? undefined
    : getSymbolForDeclarationLookup(
        compiler.ast,
        compiler.checker,
        calleeSelectedPropertyDeclarationContainer,
        compiler.ast.getSourceFile(calleeSelectedPropertyDeclarationContainer),
      );
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
    ...(calleePropertyName !== undefined ? { calleePropertyName } : {}),
    ...(calleeSelectedPropertySymbol !== undefined ? { calleeSelectedPropertySymbol } : {}),
    ...(calleeSelectedPropertyDeclaration !== undefined ? { calleeSelectedPropertyDeclaration } : {}),
    ...(calleeSelectedPropertyDeclarationContainer !== undefined ? { calleeSelectedPropertyDeclarationContainer } : {}),
    ...(calleeSelectedPropertyContainerSymbol !== undefined ? { calleeSelectedPropertyContainerSymbol } : {}),
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
  return compiler.checker.getResolvedSymbolOrNil(node, { sourceFile }) ?? undefined;
}

function getTypeAtLocation(
  compiler: NonNullable<ExtensionObservationContext["compiler"]>,
  node: Node,
  sourceFile: ReturnType<NonNullable<ExtensionObservationContext["compiler"]>["ast"]["getSourceFile"]> | undefined,
): Type | undefined {
  return compiler.checker.getTypeAtLocation(node, { sourceFile }) as Type | undefined;
}

function getTypeSymbol(
  compiler: NonNullable<ExtensionObservationContext["compiler"]>,
  type: Type,
): ExtensionFactSubject | undefined {
  return compiler.checker.getTypeSymbol(type);
}

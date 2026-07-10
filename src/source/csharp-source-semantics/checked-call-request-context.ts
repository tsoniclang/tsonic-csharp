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
export interface CsharpCheckedCallRequestContext {
  readonly calleeReceiver?: ExtensionFactSubject;
  readonly calleeReceiverType?: ExtensionFactSubject;
  readonly calleeReceiverTypeSymbol?: ExtensionFactSubject;
  readonly calleePropertyName?: string;
  readonly calleeSelectedPropertySymbol?: ExtensionFactSubject;
  readonly calleeSelectedPropertyDeclaration?: ExtensionFactSubject;
  readonly calleeSelectedPropertyDeclarationContainer?: ExtensionFactSubject;
  readonly calleeSymbol?: ExtensionFactSubject;
  readonly sourceSelectedDeclarationContainer?: ExtensionFactSubject;
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
  const calleeSymbol = request.sourceCalleeSymbol;
  const calleeReceiver = compiler.ast.is.IsPropertyAccessExpression(callee)
    ? asNodeSubject(getNodeField(callee, "Expression"))
    : undefined;
  const receiverSourceFile = calleeReceiver === undefined ? undefined : compiler.ast.getSourceFile(calleeReceiver as Node);
  const calleeReceiverType = calleeReceiver === undefined
    ? undefined
    : getTypeAtLocation(compiler, calleeReceiver as Node, receiverSourceFile);
  const calleeReceiverTypeSymbol = calleeReceiverType === undefined
    ? undefined
    : getTypeSymbol(compiler, calleeReceiverType as Type);
  const calleePropertyName = getPropertyAccessName(callee, compiler.ast);
  const calleeSelectedPropertySymbol = request.sourceCalleeSymbol;
  const calleeSelectedPropertyDeclaration = asNodeSubject(request.sourceCalleeDeclaration);
  const calleeSelectedPropertyDeclarationContainer = getNodeParent(compiler.ast, calleeSelectedPropertyDeclaration);
  const sourceSelectedDeclaration = asNodeSubject(request.sourceSelectedDeclaration);
  const sourceSelectedDeclarationContainer = getNodeParent(compiler.ast, sourceSelectedDeclaration);
  return {
    ...(calleeReceiver !== undefined ? { calleeReceiver } : {}),
    ...(calleeReceiverType !== undefined ? { calleeReceiverType } : {}),
    ...(calleeReceiverTypeSymbol !== undefined ? { calleeReceiverTypeSymbol } : {}),
    ...(calleePropertyName !== undefined ? { calleePropertyName } : {}),
    ...(calleeSelectedPropertySymbol !== undefined ? { calleeSelectedPropertySymbol } : {}),
    ...(calleeSelectedPropertyDeclaration !== undefined ? { calleeSelectedPropertyDeclaration } : {}),
    ...(calleeSelectedPropertyDeclarationContainer !== undefined ? { calleeSelectedPropertyDeclarationContainer } : {}),
    ...(calleeSymbol !== undefined ? { calleeSymbol } : {}),
    ...(sourceSelectedDeclarationContainer !== undefined ? { sourceSelectedDeclarationContainer } : {}),
  };
}

export function checkedCallIsConstruction(
  request: Pick<CheckedCallMappingRequest, "call">,
  context: Pick<ExtensionObservationContext, "compiler">,
): boolean {
  const call = asNodeSubject(request.call);
  return call !== undefined && context.compiler?.ast.is.IsNewExpression(call) === true;
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

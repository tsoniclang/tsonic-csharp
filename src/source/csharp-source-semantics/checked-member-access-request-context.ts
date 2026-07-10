import type {
  CheckedElementAccessMappingRequest,
  CheckedPropertyAccessMappingRequest,
  ExtensionFactSubject,
  ExtensionObservationContext,
  Node,
  Type,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  getNodeParent,
} from "./ast-utils.js";
export interface CsharpCheckedMemberReceiverContext {
  readonly receiverType?: ExtensionFactSubject;
  readonly receiverTypeSymbol?: ExtensionFactSubject;
}

export interface CsharpCheckedSelectedMemberContext {
  readonly sourceSelectedSymbol?: ExtensionFactSubject;
  readonly sourceSelectedDeclaration?: ExtensionFactSubject;
  readonly sourceSelectedDeclarationContainer?: ExtensionFactSubject;
}

export type CsharpCheckedPropertyAccessRequestContext =
  CsharpCheckedMemberReceiverContext &
  CsharpCheckedSelectedMemberContext;

export type CsharpCheckedElementAccessRequestContext =
  CsharpCheckedMemberReceiverContext &
  CsharpCheckedSelectedMemberContext;

export function getCsharpCheckedPropertyAccessRequestContext(
  request: CheckedPropertyAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedPropertyAccess">,
): CsharpCheckedPropertyAccessRequestContext {
  return getCsharpCheckedMemberAccessRequestContext(request.receiver, request.sourceSelectedSymbol, request.sourceSelectedDeclaration, context);
}

export function getCsharpCheckedElementAccessRequestContext(
  request: CheckedElementAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedElementAccess">,
): CsharpCheckedElementAccessRequestContext {
  return getCsharpCheckedMemberAccessRequestContext(request.receiver, request.sourceSelectedSymbol, request.sourceSelectedDeclaration, context);
}

function getCsharpCheckedMemberAccessRequestContext(
  receiverSubject: ExtensionFactSubject,
  selectedSymbol: ExtensionFactSubject | undefined,
  selectedDeclaration: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): CsharpCheckedMemberReceiverContext & CsharpCheckedSelectedMemberContext {
  const compiler = context.compiler;
  const receiver = asNodeSubject(receiverSubject);
  if (compiler === undefined || receiver === undefined) {
    return {
      ...(selectedSymbol !== undefined ? { sourceSelectedSymbol: selectedSymbol } : {}),
      ...(selectedDeclaration !== undefined ? { sourceSelectedDeclaration: selectedDeclaration } : {}),
      ...selectedMemberContext(selectedDeclaration, undefined),
    };
  }
  const receiverSourceFile = compiler.ast.getSourceFile(receiver);
  const receiverType = getTypeAtLocation(compiler, receiver, receiverSourceFile);
  const receiverTypeSymbol = receiverType === undefined
    ? undefined
    : getTypeSymbol(compiler, receiverType as Type);
  const effectiveSelectedSymbol = selectedSymbol;
  return {
    ...(receiverType !== undefined ? { receiverType } : {}),
    ...(receiverTypeSymbol !== undefined ? { receiverTypeSymbol } : {}),
    ...(effectiveSelectedSymbol !== undefined ? { sourceSelectedSymbol: effectiveSelectedSymbol } : {}),
    ...(selectedDeclaration !== undefined ? { sourceSelectedDeclaration: selectedDeclaration } : {}),
    ...selectedMemberContext(selectedDeclaration, compiler.ast),
  };
}

function selectedMemberContext(
  selectedDeclarationSubject: ExtensionFactSubject | undefined,
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"] | undefined,
): CsharpCheckedSelectedMemberContext {
  const sourceSelectedDeclaration = asNodeSubject(selectedDeclarationSubject);
  const sourceSelectedDeclarationContainer = getNodeParent(ast, sourceSelectedDeclaration);
  return {
    ...(sourceSelectedDeclaration !== undefined ? { sourceSelectedDeclaration } : {}),
    ...(sourceSelectedDeclarationContainer !== undefined ? { sourceSelectedDeclarationContainer } : {}),
  };
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

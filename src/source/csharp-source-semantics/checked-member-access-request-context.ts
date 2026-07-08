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
import {
  getAliasedSymbolIfAvailable,
  getSymbolForDeclarationLookup,
} from "./symbol-utils.js";

export interface CsharpCheckedMemberReceiverContext {
  readonly receiverSymbol?: ExtensionFactSubject;
  readonly receiverResolvedSymbol?: ExtensionFactSubject;
  readonly receiverAliasedSymbol?: ExtensionFactSubject;
  readonly receiverType?: ExtensionFactSubject;
  readonly receiverTypeSymbol?: ExtensionFactSubject;
}

export interface CsharpCheckedSelectedMemberContext {
  readonly sourceSelectedSymbol?: ExtensionFactSubject;
  readonly sourceSelectedDeclaration?: ExtensionFactSubject;
  readonly sourceSelectedDeclarationContainer?: ExtensionFactSubject;
  readonly sourceSelectedContainerSymbol?: ExtensionFactSubject;
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
      ...selectedMemberContext(selectedDeclaration, context),
    };
  }
  const receiverSourceFile = compiler.ast.getSourceFile(receiver);
  const receiverSymbol = getSymbolForDeclarationLookup(compiler.ast, compiler.checker, receiver, receiverSourceFile);
  const receiverResolvedSymbol = getResolvedSymbol(compiler, receiver, receiverSourceFile);
  const receiverAliasedSymbol = getAliasedSymbolIfAvailable(compiler.checker, receiverResolvedSymbol ?? receiverSymbol, receiverSourceFile);
  const receiverType = getTypeAtLocation(compiler, receiver, receiverSourceFile);
  const receiverTypeSymbol = receiverType === undefined
    ? undefined
    : getTypeSymbol(compiler, receiverType as Type);
  const effectiveSelectedSymbol = selectedSymbol;
  return {
    ...(receiverSymbol !== undefined ? { receiverSymbol } : {}),
    ...(receiverResolvedSymbol !== undefined ? { receiverResolvedSymbol } : {}),
    ...(receiverAliasedSymbol !== undefined ? { receiverAliasedSymbol } : {}),
    ...(receiverType !== undefined ? { receiverType } : {}),
    ...(receiverTypeSymbol !== undefined ? { receiverTypeSymbol } : {}),
    ...(effectiveSelectedSymbol !== undefined ? { sourceSelectedSymbol: effectiveSelectedSymbol } : {}),
    ...(selectedDeclaration !== undefined ? { sourceSelectedDeclaration: selectedDeclaration } : {}),
    ...selectedMemberContext(selectedDeclaration, context),
  };
}

function selectedMemberContext(
  selectedDeclarationSubject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): CsharpCheckedSelectedMemberContext {
  const compiler = context.compiler;
  const sourceSelectedDeclaration = asNodeSubject(selectedDeclarationSubject);
  const sourceSelectedDeclarationContainer = getNodeParent(sourceSelectedDeclaration);
  const sourceSelectedContainerSymbol = compiler === undefined || sourceSelectedDeclarationContainer === undefined
    ? undefined
    : getSymbolForDeclarationLookup(
        compiler.ast,
        compiler.checker,
        sourceSelectedDeclarationContainer,
        compiler.ast.getSourceFile(sourceSelectedDeclarationContainer),
      );
  return {
    ...(sourceSelectedDeclaration !== undefined ? { sourceSelectedDeclaration } : {}),
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

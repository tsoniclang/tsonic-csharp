import type {
  CheckedElementAccessMappingRequest,
  CheckedPropertyAccessMappingRequest,
  ExtensionFactSubject,
  ExtensionObservationContext,
  Node,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  getNodeParent,
} from "./ast-utils.js";
import {
  getAliasedSymbolIfAvailable,
  getSymbolDeclarations,
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
  return getCsharpCheckedMemberAccessRequestContext(request.receiver, request.sourceSelectedSymbol, context);
}

export function getCsharpCheckedElementAccessRequestContext(
  request: CheckedElementAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedElementAccess">,
): CsharpCheckedElementAccessRequestContext {
  return getCsharpCheckedMemberAccessRequestContext(request.receiver, request.sourceSelectedSymbol, context);
}

function getCsharpCheckedMemberAccessRequestContext(
  receiverSubject: ExtensionFactSubject,
  selectedSymbol: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): CsharpCheckedMemberReceiverContext & CsharpCheckedSelectedMemberContext {
  const compiler = context.compiler;
  const receiver = asNodeSubject(receiverSubject);
  if (compiler === undefined || receiver === undefined) {
    return {
      ...(selectedSymbol !== undefined ? { sourceSelectedSymbol: selectedSymbol } : {}),
      ...selectedMemberContext(selectedSymbol, context),
    };
  }
  const receiverSourceFile = compiler.ast.getSourceFile(receiver);
  const receiverSymbol = getSymbolForDeclarationLookup(compiler.ast, compiler.checker, receiver, receiverSourceFile);
  const receiverResolvedSymbol = getResolvedSymbol(compiler, receiver, receiverSourceFile);
  const receiverAliasedSymbol = getAliasedSymbolIfAvailable(compiler.checker, receiverResolvedSymbol ?? receiverSymbol, receiverSourceFile);
  const receiverType = compiler.checker.getTypeAtLocation(receiver, { sourceFile: receiverSourceFile });
  const receiverTypeSymbol = getTypeSymbol(receiverType);
  return {
    ...(receiverSymbol !== undefined ? { receiverSymbol } : {}),
    ...(receiverResolvedSymbol !== undefined ? { receiverResolvedSymbol } : {}),
    ...(receiverAliasedSymbol !== undefined ? { receiverAliasedSymbol } : {}),
    ...(receiverType !== undefined ? { receiverType } : {}),
    ...(receiverTypeSymbol !== undefined ? { receiverTypeSymbol } : {}),
    ...(selectedSymbol !== undefined ? { sourceSelectedSymbol: selectedSymbol } : {}),
    ...selectedMemberContext(selectedSymbol, context),
  };
}

function selectedMemberContext(
  selectedSymbol: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): CsharpCheckedSelectedMemberContext {
  const compiler = context.compiler;
  const sourceSelectedDeclaration = getSymbolDeclarations(selectedSymbol)[0];
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

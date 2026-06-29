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
  return getCsharpCheckedMemberAccessRequestContext(request.receiver, request.sourceSelectedSymbol, context, {
    propertyName: request.propertyName,
  });
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
  selectedPropertyOptions: { readonly propertyName?: string | undefined } = {},
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
  const receiverTypeSymbol = receiverType === undefined
    ? undefined
    : compiler.checker.getTypeSymbol(receiverType as Type);
  const effectiveSelectedSymbol = selectedSymbol ?? getCheckedReceiverPropertySymbol(
    receiverType,
    selectedPropertyOptions.propertyName,
    context,
    receiverSourceFile,
  );
  return {
    ...(receiverSymbol !== undefined ? { receiverSymbol } : {}),
    ...(receiverResolvedSymbol !== undefined ? { receiverResolvedSymbol } : {}),
    ...(receiverAliasedSymbol !== undefined ? { receiverAliasedSymbol } : {}),
    ...(receiverType !== undefined ? { receiverType } : {}),
    ...(receiverTypeSymbol !== undefined ? { receiverTypeSymbol } : {}),
    ...(effectiveSelectedSymbol !== undefined ? { sourceSelectedSymbol: effectiveSelectedSymbol } : {}),
    ...selectedMemberContext(effectiveSelectedSymbol, context),
  };
}

function getCheckedReceiverPropertySymbol(
  receiverType: ReturnType<NonNullable<ExtensionObservationContext["compiler"]>["checker"]["getTypeAtLocation"]> | undefined,
  propertyName: string | undefined,
  context: ExtensionObservationContext,
  sourceFile: ReturnType<NonNullable<ExtensionObservationContext["compiler"]>["ast"]["getSourceFile"]> | undefined,
): ExtensionFactSubject | undefined {
  if (
    receiverType === undefined ||
    propertyName === undefined ||
    context.compiler === undefined ||
    typeof context.compiler.checker.getPropertyOfType !== "function"
  ) {
    return undefined;
  }
  return context.compiler.checker.getPropertyOfType(receiverType as Type, propertyName, { sourceFile }) ?? undefined;
}

function selectedMemberContext(
  selectedSymbol: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): CsharpCheckedSelectedMemberContext {
  const compiler = context.compiler;
  const sourceSelectedDeclaration = getSymbolDeclarations(selectedSymbol, compiler?.checker)[0];
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

import {
  providerVirtualDeclarationFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionFactSubject,
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  CsharpTranslationContext,
} from "../../translate/context/index.js";
import type {
  CsharpTargetNamedTypeRef,
  TargetTypeRef,
} from "./definitions.js";
import {
  isCsharpAnyRuntimeCarrier,
} from "./runtime-carriers.js";

export function isTypeParameterTargetRef(
  type: TargetTypeRef | undefined,
): boolean {
  return type?.kind === "type-parameter";
}

export function isCsharpDelegateTargetRef(
  type: TargetTypeRef | undefined,
): boolean {
  return type?.kind === "target-named" &&
    (type as CsharpTargetNamedTypeRef).csharpDelegateSignature !== undefined;
}

export function isSourceOwnedCallableRuntimeCarrierSubject(
  node: Node | undefined,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
): boolean {
  if (node === undefined) {
    return false;
  }
  const carrier = input.types.resolveNode(node, sourceFile);
  const reference = input.navigation.referenceFor(node);
  return isCsharpDelegateTargetRef(carrier) &&
    (
      isDirectSourceCallableSyntax(node, input) ||
      isSourceDeclaredCallableReference(reference, input) ||
      (
        isSourceOwnedProjectReference(reference, input) &&
        reference !== undefined &&
        input.ast.is.IsBindingElement(reference.declaration)
      )
    );
}

export function isSourceOwnedProjectShapeSubject(
  node: Node | undefined,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
): boolean {
  if (node === undefined) {
    return false;
  }
  const carrier = input.types.resolveNode(node, sourceFile);
  if (isCsharpAnyRuntimeCarrier(carrier)) {
    return false;
  }
  return isTypeParameterTargetRef(carrier) ||
    input.navigation.isProjectShape(node);
}

export function isSourceOwnedProjectConstructibleObjectSubject(
  node: Node | undefined,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
): boolean {
  if (node === undefined) {
    return false;
  }
  const carrier = input.types.resolveNode(node, sourceFile);
  return !isCsharpAnyRuntimeCarrier(carrier) &&
    !isTypeParameterTargetRef(carrier) &&
    input.navigation.isProjectConstructibleObject(node);
}

export function isSourceDeclaredCallableReference(
  reference: ReturnType<CsharpTranslationContext["navigation"]["referenceFor"]>,
  input: CsharpTranslationContext,
): boolean {
  return reference !== undefined &&
    isSourceOwnedProjectReference(reference, input) &&
    isSourceCallableDeclaration(reference.declaration, input);
}

export function isSourceOwnedProjectReference(
  reference: ReturnType<CsharpTranslationContext["navigation"]["referenceFor"]>,
  input: CsharpTranslationContext,
): boolean {
  return reference !== undefined &&
    input.sourceFiles.some((sourceFile) => sourceFile === reference.sourceFile) &&
    !input.ast.isDeclarationFile(reference.sourceFile) &&
    !hasProviderOwnedSubject(reference.sourceFile, input) &&
    !hasProviderOwnedSubject(reference.declaration, input) &&
    !hasProviderOwnedSubject(reference.symbol, input);
}

function isSourceCallableDeclaration(
  declaration: Node | undefined,
  input: CsharpTranslationContext,
): boolean {
  if (declaration === undefined) {
    return false;
  }
  if (input.ast.is.IsVariableDeclaration(declaration)) {
    return isDirectSourceCallableSyntax(
      input.ast.as.AsVariableDeclaration(declaration)?.Initializer,
      input,
    );
  }
  if (input.ast.is.IsBindingElement(declaration)) {
    return isDirectSourceCallableSyntax(
      input.ast.as.AsBindingElement(declaration)?.Initializer,
      input,
    );
  }
  return input.ast.is.IsParameterDeclaration(declaration) ||
    input.ast.is.IsFunctionDeclaration(declaration) ||
    input.ast.is.IsFunctionExpression(declaration) ||
    input.ast.is.IsArrowFunction(declaration) ||
    input.ast.is.IsMethodDeclaration(declaration) ||
    input.ast.is.IsConstructorDeclaration(declaration);
}

function isDirectSourceCallableSyntax(
  node: Node | undefined,
  input: CsharpTranslationContext,
): boolean {
  return node !== undefined &&
    (
      input.ast.is.IsArrowFunction(node) ||
      input.ast.is.IsFunctionDeclaration(node) ||
      input.ast.is.IsFunctionExpression(node) ||
      input.ast.is.IsMethodDeclaration(node) ||
      input.ast.is.IsConstructorDeclaration(node)
    );
}

function hasProviderOwnedSubject(
  subject: ExtensionFactSubject | undefined,
  input: CsharpTranslationContext,
): boolean {
  return subject !== undefined &&
    input.sourceFacts?.getFact(
      subject,
      providerVirtualDeclarationFactKey,
    ) !== undefined;
}

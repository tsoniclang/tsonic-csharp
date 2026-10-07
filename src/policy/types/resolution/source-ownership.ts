import {
  providerVirtualDeclarationFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionFactSubject,
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  CsharpPolicyContext,
} from "../../model/context.js";
import type {
  CsharpTargetNamedTypeRef,
  TargetTypeRef,
} from "../../../target-model/types/model.js";
import {
  isCsharpJsValueTargetType,
} from "../../../target-model/types/runtime-carriers.js";
import { getCsharpMethodValue } from "../../../target-model/types/method-values.js";
import { isCsharpSourceDelegateTargetType } from "../../../target-model/types/delegates.js";

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
  input: CsharpPolicyContext,
): boolean {
  if (node === undefined) {
    return false;
  }
  const carrier = input.types.resolveNode(node, sourceFile);
  const reference = input.navigation.referenceFor(node);
  return (isCsharpDelegateTargetRef(carrier) || getCsharpMethodValue(carrier) !== undefined) &&
    (
      isDirectSourceCallableSyntax(node, input) ||
      isSourceCallableResult(node, sourceFile, carrier, input) ||
      isSourceDeclaredCallableReference(reference, input) ||
      (
        isSourceOwnedProjectReference(reference, input) &&
        reference !== undefined &&
        input.ast.is.IsBindingElement(reference.declaration)
      )
    );
}

function isSourceCallableResult(
  node: Node,
  sourceFile: SourceFile,
  carrier: TargetTypeRef | undefined,
  input: CsharpPolicyContext,
): boolean {
  if (!input.ast.is.IsCallExpression(node) || !isCsharpSourceDelegateTargetType(carrier)) return false;
  const semantics = input.semantics(sourceFile);
  const call = semantics.operations.call(node);
  if (call?.sourceSelectedSignatureKind !== "resolved") return false;
  const declaration = semantics.declarations.signatureDeclaration(call.selectedSignature);
  const file = declaration === undefined ? undefined : input.ast.getSourceFile(declaration);
  return declaration !== undefined && file !== undefined &&
    input.navigation.isProjectDeclaration(declaration) &&
    input.sourceFiles.includes(file) && !input.ast.isDeclarationFile(file) &&
    !hasProviderOwnedSubject(file, input) && !hasProviderOwnedSubject(declaration, input);
}

export function isSourceOwnedProjectShapeSubject(
  node: Node | undefined,
  sourceFile: SourceFile,
  input: CsharpPolicyContext,
): boolean {
  if (node === undefined) {
    return false;
  }
  const carrier = input.types.resolveNode(node, sourceFile);
  if (isCsharpJsValueTargetType(carrier)) {
    return false;
  }
  return isTypeParameterTargetRef(carrier) ||
    input.navigation.isProjectShape(node);
}

export function isSourceOwnedProjectConstructibleObjectSubject(
  node: Node | undefined,
  sourceFile: SourceFile,
  input: CsharpPolicyContext,
): boolean {
  if (node === undefined) {
    return false;
  }
  const carrier = input.types.resolveNode(node, sourceFile);
  return !isCsharpJsValueTargetType(carrier) &&
    !isTypeParameterTargetRef(carrier) &&
    input.navigation.isProjectConstructibleObject(node);
}

export function isSourceDeclaredCallableReference(
  reference: ReturnType<CsharpPolicyContext["navigation"]["referenceFor"]>,
  input: CsharpPolicyContext,
): boolean {
  return reference !== undefined &&
    isSourceOwnedProjectReference(reference, input) &&
    isSourceCallableDeclaration(reference.declaration, input);
}

export function isSourceOwnedProjectReference(
  reference: ReturnType<CsharpPolicyContext["navigation"]["referenceFor"]>,
  input: CsharpPolicyContext,
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
  input: CsharpPolicyContext,
): boolean {
  if (declaration === undefined) {
    return false;
  }
  if (input.ast.is.IsVariableDeclaration(declaration)) {
    const initializer = input.ast.as.AsVariableDeclaration(declaration)?.Initializer;
    if (initializer === undefined) return false;
    const semantics = input.semanticsFor(initializer);
    const type = semantics.types.expressionType(initializer);
    const signatures = type === undefined ? [] : semantics.types.callSignatures(type);
    return signatures.length > 0 && signatures.every(signature => {
      const selected = semantics.declarations.signatureDeclaration(signature);
      const file = selected === undefined ? undefined : input.ast.getSourceFile(selected);
      return selected !== undefined && file !== undefined &&
        input.navigation.isProjectDeclaration(selected) && input.sourceFiles.includes(file) &&
        !input.ast.isDeclarationFile(file) &&
        (isDirectSourceCallableSyntax(selected, input) || input.ast.is.IsFunctionTypeNode(selected));
    });
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
  input: CsharpPolicyContext,
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
  input: CsharpPolicyContext,
): boolean {
  return subject !== undefined &&
    input.sourceFacts?.getFact(
      subject,
      providerVirtualDeclarationFactKey,
    ) !== undefined;
}

// Source ownership of a referenced callable or binding: declared in a project source file (not a declaration file,
// not provider-virtual). Reads published identity, selections and values only (nextgen C-2542, R2).
import { providerVirtualDeclarationFactKey } from "@tsonic/tsts";
import type { ExtensionFactSubject, Node } from "@tsonic/tsts";
import { sourceTypeDescriptorStructure, type SourceDeclarationTarget } from "@tsonic/target-api/source";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { getCsharpMethodValue } from "../../target-model/types/method-values.js";
import { isCsharpSourceDelegateTargetType } from "../../target-model/types/carriers/delegates.js";
import { isCsharpDelegateTargetRef } from "../../policy/ownership/type-categories.js";
import { sourceProjectTarget } from "../program/source-facts.js";

type OwnershipInput = Pick<CsharpPolicyContext, "ast" | "facts" | "sourceFiles" | "sourceFacts" | "types">;

/** A callable runtime carrier whose value is produced by project source (a source callable, call result or binding). */
export function isSourceOwnedCallableRuntimeCarrierSubject(node: Node | undefined, input: OwnershipInput): boolean {
  if (node === undefined) return false;
  const represented = input.types.value(node);
  const carrier = represented.kind === "csharp-refused" ? undefined : represented;
  const reference = sourceProjectTarget(input.facts, node);
  return (isCsharpDelegateTargetRef(carrier) || getCsharpMethodValue(carrier) !== undefined) &&
    (isDirectSourceCallableSyntax(node, input) || isSourceCallableResult(node, carrier, input) ||
      isSourceDeclaredCallableReference(reference, input) ||
      (isSourceOwnedProjectReference(reference, input) && reference !== undefined &&
        input.ast.is.IsBindingElement(reference.declaration)));
}

function isSourceCallableResult(node: Node, carrier: TargetTypeRef | undefined, input: OwnershipInput): boolean {
  if (!input.ast.is.IsCallExpression(node) || !isCsharpSourceDelegateTargetType(carrier)) return false;
  const call = input.facts.selections.call(node);
  if (call === undefined || call.kind === "refused") return false;
  const declaration = call.signature;
  const file = input.ast.getSourceFile(declaration);
  return file !== undefined && input.facts.navigation.identity.isProjectDeclaration(declaration) &&
    input.sourceFiles.includes(file) && !input.ast.isDeclarationFile(file) &&
    !hasProviderOwnedSubject(file, input) && !hasProviderOwnedSubject(declaration, input);
}

export function isSourceDeclaredCallableReference(reference: SourceDeclarationTarget | undefined, input: OwnershipInput): boolean {
  return reference !== undefined && isSourceOwnedProjectReference(reference, input) &&
    isSourceCallableDeclaration(reference.declaration, input);
}

export function isSourceOwnedProjectReference(
  reference: SourceDeclarationTarget | undefined,
  input: Pick<CsharpPolicyContext, "ast" | "sourceFiles" | "sourceFacts">,
): boolean {
  return reference !== undefined &&
    input.sourceFiles.some(sourceFile => sourceFile === reference.sourceFile) &&
    !input.ast.isDeclarationFile(reference.sourceFile) &&
    !hasProviderOwnedSubject(reference.sourceFile, input) &&
    !hasProviderOwnedSubject(reference.declaration, input);
}

function isSourceCallableDeclaration(declaration: Node | undefined, input: OwnershipInput): boolean {
  if (declaration === undefined) return false;
  if (input.ast.is.IsVariableDeclaration(declaration)) {
    const initializer = input.ast.as.AsVariableDeclaration(declaration)?.Initializer;
    if (initializer === undefined) return false;
    const outcome = input.facts.values.type(initializer);
    const descriptor = outcome.kind === "refused" ? undefined : sourceTypeDescriptorStructure(outcome.type);
    const signatures = descriptor?.kind === "callable" ? descriptor.calls : [];
    return signatures.length > 0 && signatures.every(signature => {
      const selected = signature.declaration;
      const file = selected === undefined ? undefined : input.ast.getSourceFile(selected);
      return selected !== undefined && file !== undefined &&
        input.facts.navigation.identity.isProjectDeclaration(selected) && input.sourceFiles.includes(file) &&
        !input.ast.isDeclarationFile(file) &&
        (isDirectSourceCallableSyntax(selected, input) || input.ast.is.IsFunctionTypeNode(selected));
    });
  }
  if (input.ast.is.IsBindingElement(declaration)) {
    return isDirectSourceCallableSyntax(input.ast.as.AsBindingElement(declaration)?.Initializer, input);
  }
  return input.ast.is.IsParameterDeclaration(declaration) || input.ast.is.IsFunctionDeclaration(declaration) ||
    input.ast.is.IsFunctionExpression(declaration) || input.ast.is.IsArrowFunction(declaration) ||
    input.ast.is.IsMethodDeclaration(declaration) || input.ast.is.IsConstructorDeclaration(declaration);
}

function isDirectSourceCallableSyntax(node: Node | undefined, input: Pick<CsharpPolicyContext, "ast">): boolean {
  return node !== undefined && (input.ast.is.IsArrowFunction(node) || input.ast.is.IsFunctionDeclaration(node) ||
    input.ast.is.IsFunctionExpression(node) || input.ast.is.IsMethodDeclaration(node) ||
    input.ast.is.IsConstructorDeclaration(node));
}

function hasProviderOwnedSubject(subject: ExtensionFactSubject | undefined, input: Pick<CsharpPolicyContext, "sourceFacts">): boolean {
  return subject !== undefined && input.sourceFacts?.getFact(subject, providerVirtualDeclarationFactKey) !== undefined;
}

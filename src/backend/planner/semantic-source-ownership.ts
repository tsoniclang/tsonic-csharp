import type { Node, SourceFile, TargetTypeRef } from "@tsonic/tsts";
import type { TargetCompileInput } from "@tsonic/target-api";
import {
  KindArrowFunction,
  KindConstructor,
  KindBindingElement,
  KindFunctionDeclaration,
  KindFunctionExpression,
  KindMethodDeclaration,
  KindParameter,
  KindVariableDeclaration,
  SourceKind,
} from "./source-ast.js";
import { providerVirtualDeclarationFactKey } from "@tsonic/tsts";
import {
  getTargetTypeRefForNode,
} from "./runtime-carriers.js";
import {
  isCsharpAnyRuntimeCarrier,
} from "../../source/csharp-source-semantics/target-types.js";
import { isProviderVirtualSourceFile } from "./provider-virtual-source-files.js";

export function isTypeParameterTargetRef(type: TargetTypeRef | undefined): boolean {
  return type?.kind === "type-parameter";
}

export function isCsharpDelegateTargetRef(type: TargetTypeRef | undefined): boolean {
  return typeof (type as { readonly csharpDelegateSignature?: unknown } | undefined)?.csharpDelegateSignature === "object";
}

export function isSourceOwnedCallableRuntimeCarrierSubject(node: Node | undefined, sourceFile: SourceFile, input: TargetCompileInput): boolean {
  const carrier = getTargetTypeRefForNode(input, node, sourceFile);
  const sourceReference = input.analysis.getProjectSourceReferenceForNode(node, { sourceFile });
  return isCsharpDelegateTargetRef(carrier) &&
    (isDirectSourceCallableSyntax(node, input) ||
      isSourceDeclaredCallableReference(sourceReference, input) ||
      isSourceOwnedCallableBindingReference(sourceReference, input));
}

export function isSourceOwnedProjectShapeSubject(node: Node | undefined, sourceFile: SourceFile, input: TargetCompileInput): boolean {
  if (node === undefined) {
    return false;
  }
  const carrier = getTargetTypeRefForNode(input, node, sourceFile);
  if (isCsharpAnyRuntimeCarrier(carrier)) {
    return false;
  }
  if (isTypeParameterTargetRef(carrier)) {
    return true;
  }
  return input.analysis.isProjectSourceShapeForNode(node, { sourceFile });
}

export function isSourceOwnedProjectConstructibleObjectSubject(node: Node | undefined, sourceFile: SourceFile, input: TargetCompileInput): boolean {
  if (node === undefined) {
    return false;
  }
  const carrier = getTargetTypeRefForNode(input, node, sourceFile);
  if (isCsharpAnyRuntimeCarrier(carrier) || isTypeParameterTargetRef(carrier)) {
    return false;
  }
  return input.analysis.isProjectSourceConstructibleObjectForNode(node, { sourceFile });
}

export function isSourceDeclaredCallableReference(
  reference: ReturnType<TargetCompileInput["analysis"]["getProjectSourceReferenceForNode"]>,
  input: TargetCompileInput,
): boolean {
  return reference !== undefined &&
    isSourceOwnedProjectReference(reference, input) &&
    !hasProviderOnlySymbolName(reference.symbol) &&
    isSourceCallableDeclaration(reference.declaration, input);
}

export function isSourceOwnedProjectReference(
  reference: ReturnType<TargetCompileInput["analysis"]["getProjectSourceReferenceForNode"]>,
  input: TargetCompileInput,
): boolean {
  return reference !== undefined &&
    input.sourceFiles.some((sourceFile) => sourceFile === reference.sourceFile) &&
    !reference.sourceFile.IsDeclarationFile &&
    !isProviderVirtualSourceFile(input, reference.sourceFile) &&
    !hasProviderOwnedSubject(reference.sourceFile, input) &&
    !hasProviderOwnedSubject(reference.declaration, input) &&
    !hasProviderOwnedSubject(reference.symbol, input);
}

function isSourceCallableDeclaration(declaration: Node | undefined, input: TargetCompileInput): boolean {
  switch (SourceKind(input.ast, declaration)) {
    case KindVariableDeclaration:
    case KindBindingElement:
      return isDirectSourceCallableSyntax(getNodeField(declaration, "Initializer"), input);
    case KindParameter:
    case KindFunctionDeclaration:
    case KindFunctionExpression:
    case KindArrowFunction:
    case KindMethodDeclaration:
    case KindConstructor:
      return true;
    default:
      return false;
  }
}

function isSourceOwnedCallableBindingReference(
  reference: ReturnType<TargetCompileInput["analysis"]["getProjectSourceReferenceForNode"]>,
  input: TargetCompileInput,
): boolean {
  return isSourceOwnedProjectReference(reference, input) &&
    SourceKind(input.ast, reference?.declaration) === KindBindingElement;
}

function hasProviderOnlySymbolName(symbol: ReturnType<TargetCompileInput["analysis"]["getResolvedSymbol"]> | undefined): boolean {
  return symbol?.Name === undefined || symbol.Name.length === 0;
}

function isDirectSourceCallableSyntax(node: Node | undefined, input: TargetCompileInput): boolean {
  switch (SourceKind(input.ast, node)) {
    case KindArrowFunction:
    case KindFunctionDeclaration:
    case KindFunctionExpression:
    case KindMethodDeclaration:
    case KindConstructor:
      return true;
    default:
      return false;
  }
}

function hasProviderOwnedSubject(subject: Parameters<TargetCompileInput["facts"]["getTargetBindingFact"]>[0], input: TargetCompileInput): boolean {
  return input.facts.getTargetBindingFact(subject) !== undefined ||
    input.facts.getFact(subject, providerVirtualDeclarationFactKey) !== undefined ||
    input.facts.getTargetConversionFact(subject) !== undefined;
}

function getNodeField(node: Node | undefined, field: string): Node | undefined {
  return (node as Record<string, Node | undefined> | undefined)?.[field];
}

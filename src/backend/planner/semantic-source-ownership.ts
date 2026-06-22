import type { Node, SourceFile, TargetTypeRef } from "@tsonic/tsts";
import type { TargetCompileInput } from "@tsonic/target-api";
import {
  KindConstructor,
  KindBindingElement,
  KindFunctionDeclaration,
  KindFunctionExpression,
  KindMethodDeclaration,
  KindParameter,
  KindVariableDeclaration,
  SourceKind,
} from "./source-ast.js";
import {
  getTargetTypeRefForNode,
} from "./runtime-carriers.js";

export function isTypeParameterTargetRef(type: TargetTypeRef | undefined): boolean {
  return type?.kind === "type-parameter";
}

export function isCsharpDelegateTargetRef(type: TargetTypeRef | undefined): boolean {
  return typeof (type as { readonly csharpDelegateSignature?: unknown } | undefined)?.csharpDelegateSignature === "object" ||
    (type?.kind === "target-named" && isKnownCsharpDelegateTargetId(type.id));
}

export function isSourceOwnedCallableRuntimeCarrierSubject(node: Node | undefined, sourceFile: SourceFile, input: TargetCompileInput): boolean {
  const carrier = getTargetTypeRefForNode(input, node, sourceFile);
  return isCsharpDelegateTargetRef(carrier);
}

function isKnownCsharpDelegateTargetId(id: string): boolean {
  return id === "System.Action" ||
    id.startsWith("System.Action`") ||
    id.startsWith("System.Func`");
}

export function isSourceOwnedProjectShapeSubject(node: Node | undefined, sourceFile: SourceFile, input: TargetCompileInput): boolean {
  if (node === undefined) {
    return false;
  }
  if (isTypeParameterTargetRef(getTargetTypeRefForNode(input, node, sourceFile))) {
    return true;
  }
  return input.semantics.isProjectSourceShapeForNode(node, { sourceFile });
}

export function isSourceOwnedProjectConstructibleObjectSubject(node: Node | undefined, sourceFile: SourceFile, input: TargetCompileInput): boolean {
  if (node === undefined) {
    return false;
  }
  if (isTypeParameterTargetRef(getTargetTypeRefForNode(input, node, sourceFile))) {
    return false;
  }
  return input.semantics.isProjectSourceConstructibleObjectForNode(node, { sourceFile });
}

export function isSourceDeclaredCallableReference(
  reference: ReturnType<TargetCompileInput["semantics"]["getProjectSourceReferenceForNode"]>,
  input: TargetCompileInput,
): boolean {
  return reference !== undefined &&
    !hasProviderOnlySymbolName(reference.symbol) &&
    isSourceCallableDeclaration(reference.declaration, input);
}

function isSourceCallableDeclaration(declaration: Node | undefined, input: TargetCompileInput): boolean {
  switch (SourceKind(input.ast, declaration)) {
    case KindVariableDeclaration:
    case KindBindingElement:
    case KindParameter:
    case KindFunctionDeclaration:
    case KindFunctionExpression:
    case KindMethodDeclaration:
    case KindConstructor:
      return true;
    default:
      return false;
  }
}

function hasProviderOnlySymbolName(symbol: ReturnType<TargetCompileInput["semantics"]["getResolvedSymbol"]> | undefined): boolean {
  return symbol?.Name === undefined || symbol.Name.length === 0;
}

import {
  providerVirtualDeclarationFactKey,
} from "@tsonic/tsts";
import {
  asCsharpRuntimeCarrierFactSubject,
  csharpRuntimeCarrierFactKey,
} from "../csharp-facts.js";
import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  getNodeField,
} from "./ast-utils.js";
import {
  getSymbolDeclarations,
  getSymbolForDeclarationLookup,
} from "./symbol-utils.js";
import type {
  TargetTypeRefResolutionOptions,
} from "./target-member-selection.js";
import type {
  CsharpTargetTypeResolutionHost,
} from "./target-type-resolution-host.js";

export type TargetTypeSubjectResolver = (
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
) => TargetTypeRef | undefined;

export function getCatchVariableTargetTypeRef(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
  exceptionCarrier: TargetTypeRef | undefined,
): TargetTypeRef | undefined {
  if (exceptionCarrier === undefined) {
    return undefined;
  }
  const ast = context.compiler?.ast;
  const checker = context.compiler?.checker;
  const node = asNodeSubject(subject);
  if (ast === undefined || checker === undefined || node === undefined || !ast.is.IsIdentifier(node)) {
    return undefined;
  }
  if (!isCatchVariableIdentifier(node, ast)) {
    return undefined;
  }
  const symbol = checker.getSymbolAtLocation(node) ?? checker.getResolvedSymbol(node);
  const declarations = getSymbolDeclarations(symbol, checker);
  return declarations.some((declaration) => {
      const parent = asNodeSubject(getNodeField(declaration, "Parent"));
      return parent !== undefined && ast.is.IsCatchClause(parent);
    })
    ? exceptionCarrier
    : undefined;
}

function isCatchVariableIdentifier(
  node: NonNullable<ReturnType<typeof asNodeSubject>>,
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
): boolean {
  const parent = ast.parent(node);
  if (parent === undefined || !ast.is.IsVariableDeclaration(parent) || asNodeSubject(getNodeField(parent, "name")) !== node) {
    return false;
  }
  const grandparent = ast.parent(parent);
  return grandparent !== undefined && ast.is.IsCatchClause(grandparent);
}

export function resolveCsharpRuntimeCarrier(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): TargetTypeRef | undefined {
  const exactSubject = asCsharpRuntimeCarrierFactSubject(subject);
  return exactSubject === undefined
    ? undefined
    : context.facts.get(exactSubject, csharpRuntimeCarrierFactKey)?.carrier ??
      context.factResolver.resolve(exactSubject, csharpRuntimeCarrierFactKey)?.carrier;
}

export function getProviderVirtualDeclarationTargetTypeRef(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): TargetTypeRef | undefined {
  const targetIdentity = subject === undefined
    ? undefined
    : context.factResolver.resolve(subject, providerVirtualDeclarationFactKey)?.targetIdentity;
  return targetIdentity?.kind === "target-named" ? targetIdentity : undefined;
}

export function getProviderVirtualDeclarationTargetTypeRefFromDeclarations(
  type: Type,
  context: ExtensionObservationContext,
): TargetTypeRef | undefined {
  const checker = context.compiler?.checker;
  const typeSymbol = checker?.getTypeSymbol(type);
  for (const declaration of getSymbolDeclarations(typeSymbol, checker)) {
    const target = getProviderVirtualDeclarationTargetTypeRef(declaration, context);
    if (target !== undefined) {
      return target;
    }
  }
  return undefined;
}

export function getTargetTypeRefFromDeclarationAnnotation(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
  resolveSubject: TargetTypeSubjectResolver,
): TargetTypeRef | undefined {
  const ast = context.compiler?.ast;
  const node = asNodeSubject(subject);
  const checker = context.compiler?.checker;
  if (node === undefined || checker === undefined || ast === undefined) {
    return undefined;
  }
  const symbol = getSymbolForDeclarationLookup(ast, checker, node, ast.getSourceFile(node));
  const declarations = getSymbolDeclarations(symbol, checker);
  for (const declaration of declarations) {
    const typeNode = asNodeSubject(getNodeField(declaration, "Type"));
    if (typeNode !== undefined && typeNode !== node) {
      const result = resolveSubject(typeNode, context, {
        ...options,
        sourceFile: options.sourceFile ?? ast.getSourceFile(typeNode),
      }, host);
      if (result !== undefined) {
        return result;
      }
    }
  }
  return undefined;
}

import {
  providerVirtualDeclarationFactKey,
} from "@tsonic/tsts";
import type {
  CheckedCallMappingRequest,
  CheckedPropertyAccessMappingRequest,
  ExtensionFactSubject,
  ExtensionObservationContext,
  Node,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  visitAstReaderNodes,
} from "../../ast-utils.js";
import {
  isCsharpNodejsProviderDeclaration,
} from "./identity.js";
import type {
  NodejsProviderDeclarationIdentity,
} from "./identity.js";
import {
  getNodejsStaticPropertyDeclaration,
} from "./members.js";

export function getNodejsCheckedCallDeclaration(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): NodejsProviderDeclarationIdentity | undefined {
  for (const subject of [
    request.sourceSelectedSignature,
    request.sourceSelectedDeclaration,
    request.calleeAliasedSymbol,
    request.calleeResolvedSymbol,
    request.calleeSymbol,
  ]) {
    const declaration = getProviderExportDeclaration(context, subject);
    if (declaration !== undefined) {
      return declaration;
    }
  }
  return undefined;
}

export function getNodejsCheckedPropertyDeclaration(
  request: CheckedPropertyAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedPropertyAccess">,
): NodejsProviderDeclarationIdentity | undefined {
  for (const subject of [
    request.sourceSelectedPropertySymbol,
    request.sourceSelectedDeclaration,
  ]) {
    const declaration = getProviderExportDeclaration(context, subject);
    if (declaration !== undefined) {
      return declaration;
    }
  }
  for (const subject of [
    request.sourceSelectedDeclarationContainer,
    request.sourceSelectedContainerSymbol,
    request.receiverTypeSymbol,
    request.receiverType,
    request.receiverResolvedSymbol,
    request.receiverAliasedSymbol,
    request.receiverSymbol,
    request.receiver,
  ]) {
    const container = getProviderExportDeclaration(context, subject);
    if (container === undefined) {
      continue;
    }
    const declaration = getNodejsStaticPropertyDeclaration(container.moduleSpecifier, request.propertyName);
    if (declaration !== undefined) {
      return declaration;
    }
  }
  const namespaceModuleSpecifier = getProviderNamespaceImportSpecifier(request.receiver, context);
  if (namespaceModuleSpecifier !== undefined) {
    const declaration = getNodejsStaticPropertyDeclaration(namespaceModuleSpecifier, request.propertyName);
    if (declaration !== undefined) {
      return declaration;
    }
  }
  return undefined;
}

function getProviderExportDeclaration(
  context: ExtensionObservationContext,
  subject: ExtensionFactSubject | undefined,
): NodejsProviderDeclarationIdentity | undefined {
  const declaration = context.facts.get(subject, providerVirtualDeclarationFactKey);
  return declaration === undefined || !isCsharpNodejsProviderDeclaration(declaration)
    ? undefined
    : declaration;
}

export function getProviderNamespaceImportSpecifier(
  receiver: ExtensionFactSubject,
  context: ExtensionObservationContext,
): string | undefined {
  const ast = context.compiler?.ast;
  const receiverNode = asNodeSubject(receiver);
  if (ast === undefined || receiverNode === undefined || !ast.is.IsIdentifier(receiverNode)) {
    return undefined;
  }
  const receiverName = ast.text(receiverNode);
  const sourceFile = ast.getSourceFile(receiverNode);
  if (sourceFile === undefined) {
    return undefined;
  }
  let moduleSpecifier: string | undefined;
  visitAstReaderNodes(ast, sourceFile, (node) => {
    if (moduleSpecifier !== undefined || !ast.is.IsImportDeclaration(node)) {
      return;
    }
    const importDeclaration = ast.as.AsImportDeclaration(node);
    const importClause = ast.as.AsImportClause(importDeclaration?.ImportClause);
    const namedBindings = importClause?.NamedBindings;
    if (namedBindings === undefined || ast.as.AsNamespaceImport(namedBindings) === undefined) {
      return;
    }
    const name = ast.name(namedBindings);
    if (name === undefined || ast.text(name) !== receiverName) {
      return;
    }
    moduleSpecifier = getStringLiteralText(importDeclaration?.ModuleSpecifier, ast);
  });
  return moduleSpecifier;
}

function getStringLiteralText(
  node: Node | undefined,
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
): string | undefined {
  if (node === undefined) {
    return undefined;
  }
  const text = ast.text(node);
  if ((text.startsWith("\"") && text.endsWith("\"")) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  return text;
}

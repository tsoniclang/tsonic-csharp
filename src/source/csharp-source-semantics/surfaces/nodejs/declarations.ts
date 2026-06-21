import {
  providerVirtualDeclarationFactKey,
} from "@tsonic/tsts";
import type {
  CheckedCallMappingRequest,
  CheckedPropertyAccessMappingRequest,
  ExtensionFactSubject,
  ExtensionObservationContext,
  Node,
  ProviderVirtualDeclarationFact,
  SourceFile,
  Symbol,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  getNodeField,
} from "../../ast-utils.js";
import {
  isNodejsProviderModule,
} from "./members.js";

export interface NodejsProviderDeclarationReference {
  readonly moduleSpecifier: string;
  readonly exportName: string;
}

export function getNodejsCheckedCallDeclaration(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): NodejsProviderDeclarationReference | undefined {
  const direct = getProviderExportDeclaration(context, request.sourceSelectedDeclaration);
  if (direct !== undefined) {
    return direct;
  }
  const moduleDeclaration = getProviderModuleDeclaration(context, [
    request.calleeReceiverAliasedSymbol,
    request.calleeReceiverResolvedSymbol,
    request.calleeReceiverSymbol,
    request.calleeReceiver,
  ]);
  const namespaceModuleSpecifier = moduleDeclaration?.moduleSpecifier ??
    getNamespaceImportModuleSpecifier(context, request.calleeReceiver, request.call);
  return moduleDeclaration === undefined || request.calleePropertyName === undefined
    ? namespaceModuleSpecifier === undefined || request.calleePropertyName === undefined
      ? undefined
      : {
          moduleSpecifier: namespaceModuleSpecifier,
          exportName: request.calleePropertyName,
        }
    : {
        moduleSpecifier: moduleDeclaration.moduleSpecifier,
        exportName: request.calleePropertyName,
      };
}

export function getNodejsCheckedPropertyDeclaration(
  request: CheckedPropertyAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedPropertyAccess">,
): NodejsProviderDeclarationReference | undefined {
  const direct = getProviderExportDeclaration(context, request.sourceSelectedDeclaration);
  if (direct !== undefined) {
    return direct;
  }
  const moduleDeclaration = getProviderModuleDeclaration(context, [
    request.receiverAliasedSymbol,
    request.receiverResolvedSymbol,
    request.receiverSymbol,
    request.receiver,
  ]);
  const namespaceModuleSpecifier = moduleDeclaration?.moduleSpecifier ??
    getNamespaceImportModuleSpecifier(context, request.receiver, request.expression);
  return moduleDeclaration === undefined
    ? namespaceModuleSpecifier === undefined
      ? undefined
      : {
          moduleSpecifier: namespaceModuleSpecifier,
          exportName: request.propertyName,
        }
    : {
        moduleSpecifier: moduleDeclaration.moduleSpecifier,
        exportName: request.propertyName,
      };
}

function getProviderExportDeclaration(
  context: ExtensionObservationContext,
  subject: ExtensionFactSubject | undefined,
): NodejsProviderDeclarationReference | undefined {
  const declaration = context.facts.get(subject, providerVirtualDeclarationFactKey);
  return declaration?.exportName === undefined || !isNodejsProviderModule(declaration.moduleSpecifier)
    ? undefined
    : {
        moduleSpecifier: declaration.moduleSpecifier,
        exportName: declaration.exportName,
      };
}

function getProviderModuleDeclaration(
  context: ExtensionObservationContext,
  subjects: readonly (ExtensionFactSubject | undefined)[],
): ProviderVirtualDeclarationFact | undefined {
  for (const subject of subjects) {
    const declaration = context.facts.get(subject, providerVirtualDeclarationFactKey);
    if (declaration?.exportName === undefined && isNodejsProviderModule(declaration?.moduleSpecifier)) {
      return declaration;
    }
  }
  return undefined;
}

function getNamespaceImportModuleSpecifier(
  context: ExtensionObservationContext,
  receiver: ExtensionFactSubject | undefined,
  operation: ExtensionFactSubject,
): string | undefined {
  const compiler = context.compiler;
  const receiverNode = asNodeSubject(receiver);
  const operationNode = asNodeSubject(operation);
  if (compiler === undefined || receiverNode === undefined || operationNode === undefined) {
    return undefined;
  }
  const sourceFile = compiler.ast.getSourceFile(operationNode);
  if (sourceFile === undefined) {
    return undefined;
  }
  const receiverSymbols = getSymbolLookupSubjects(context, receiverNode, sourceFile);
  if (receiverSymbols.length === 0) {
    return undefined;
  }
  let matched: string | undefined;
  visitCompilerNodes(compiler.ast, sourceFile, (node) => {
    if (matched !== undefined || !compiler.ast.is.IsImportDeclaration(node)) {
      return;
    }
    const moduleSpecifierNode = asNodeSubject(getNodeField(node, "ModuleSpecifier"));
    const moduleSpecifier = compiler.ast.text(moduleSpecifierNode);
    if (!isNodejsProviderModule(moduleSpecifier)) {
      return;
    }
    const importClause = asNodeSubject(getNodeField(node, "ImportClause"));
    const namedBindings = asNodeSubject(getNodeField(importClause, "NamedBindings"));
    if (namedBindings === undefined || !compiler.ast.is.IsNamespaceImport(namedBindings)) {
      return;
    }
    const namespaceName = asNodeSubject(getNodeField(namedBindings, "Name") ?? getNodeField(namedBindings, "name"));
    if (namespaceName === undefined) {
      return;
    }
    const namespaceSymbols = getSymbolLookupSubjects(context, namespaceName, sourceFile);
    if (namespaceSymbols.some((namespaceSymbol) => receiverSymbols.includes(namespaceSymbol))) {
      matched = moduleSpecifier;
    }
  });
  return matched;
}

function getSymbolLookupSubjects(
  context: ExtensionObservationContext,
  node: Node,
  sourceFile: SourceFile,
): readonly Symbol[] {
  const compiler = context.compiler;
  if (compiler === undefined) {
    return [];
  }
  const symbols: Symbol[] = [];
  const add = (symbol: Symbol | undefined): void => {
    if (symbol !== undefined && !symbols.includes(symbol)) {
      symbols.push(symbol);
    }
  };
  add(compiler.checker.getSymbolAtLocation(node, { sourceFile }));
  add(compiler.checker.getResolvedSymbol(node, { sourceFile }));
  for (const symbol of [...symbols]) {
    add(compiler.checker.getAliasedSymbol(symbol, { sourceFile }));
  }
  return symbols;
}

function visitCompilerNodes(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
  visitor: (node: Node) => void,
  seen: WeakSet<object> = new WeakSet(),
): void {
  if (seen.has(node)) {
    return;
  }
  seen.add(node);
  visitor(node);
  ast.forEachChild(node, (child) => {
    if (child !== undefined) {
      visitCompilerNodes(ast, child, visitor, seen);
    }
  });
}

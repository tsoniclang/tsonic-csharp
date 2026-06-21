import {
  acceptObservation,
  deferObservation,
  providerVirtualDeclarationFactKey,
  rejectObservation,
} from "@tsonic/tsts";
import type {
  CheckedCallMappingRequest,
  CheckedCallMappingResult,
  CheckedOperationMappingResult,
  CheckedPropertyAccessMappingRequest,
  ExtensionObservation,
  ExtensionObservationContext,
  ExtensionFactSubject,
  Node,
  ProviderVirtualDeclarationFact,
  SourceFile,
  Symbol,
  TargetMember,
  TargetOperationFact,
} from "@tsonic/tsts";
import {
  csharpProviderDiagnostic,
} from "../../diagnostics.js";
import {
  csharpTargetId,
} from "../../identity.js";
import {
  getNodeCryptoTargetMembers,
  nodeCryptoModuleSpecifier,
} from "./crypto.js";
import {
  getNodeFsTargetMembers,
  nodeFsModuleSpecifier,
} from "./filesystem.js";
import {
  getNodeOsPropertyMembers,
  getNodeOsTargetMembers,
  nodeOsModuleSpecifier,
} from "./os.js";
import {
  getNodePathPropertyMembers,
  getNodePathTargetMembers,
  nodePathModuleSpecifier,
} from "./path.js";
import {
  getNodeProcessPropertyMembers,
  getNodeProcessTargetMembers,
  nodeProcessModuleSpecifier,
} from "./process.js";
import {
  createCsharpNodejsSurfaceBindingProvider,
} from "./provider.js";

export {
  createCsharpNodejsSurfaceBindingProvider,
};

export interface CsharpNodejsSurfaceMappers {
  readonly mapCheckedCall: (
    request: CheckedCallMappingRequest,
    context: ExtensionObservationContext<"operation.mapCheckedCall">,
  ) => ExtensionObservation<CheckedCallMappingResult>;
  readonly mapCheckedPropertyAccess: (
    request: CheckedPropertyAccessMappingRequest,
    context: ExtensionObservationContext<"operation.mapCheckedPropertyAccess">,
  ) => ExtensionObservation<CheckedOperationMappingResult>;
}

export function createCsharpNodejsSurfaceMappers(extensionId: string): CsharpNodejsSurfaceMappers {
  return {
    mapCheckedCall(request, context) {
      if (request.target !== undefined && request.target !== csharpTargetId) {
        return deferObservation;
      }
      const declaration = getNodejsCheckedCallDeclaration(request, context);
      if (declaration === undefined) {
        return deferObservation;
      }
      const candidates = getNodejsCallTargetMembers(declaration.moduleSpecifier, declaration.exportName);
      const member = selectSingleTargetMember(candidates);
      if (member === undefined) {
        return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_NODEJS_CALL_NOT_MAPPED", 9100200, `C# NodeJS surface could not map checked '${declaration.moduleSpecifier}' export '${declaration.exportName}' to a target member.`));
      }
      return acceptObservation<CheckedCallMappingResult>({
        selectedSignature: { member },
      }, [{ message: `C# NodeJS surface target call selected from checked provider module '${declaration.moduleSpecifier}'.` }]);
    },
    mapCheckedPropertyAccess(request, context) {
      if (request.target !== undefined && request.target !== csharpTargetId) {
        return deferObservation;
      }
      const declaration = getNodejsCheckedPropertyDeclaration(request, context);
      if (declaration === undefined) {
        return deferObservation;
      }
      const operation = getCsharpNodejsStaticPropertyOperation(declaration.moduleSpecifier, declaration.exportName);
      if (operation === undefined) {
        return deferObservation;
      }
      return acceptObservation<CheckedOperationMappingResult>({
        operation,
      }, [{ message: `C# NodeJS surface target property selected from checked provider module '${declaration.moduleSpecifier}'.` }]);
    },
  };
}

interface NodejsProviderDeclarationReference {
  readonly moduleSpecifier: string;
  readonly exportName: string;
}

function getNodejsCheckedCallDeclaration(
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

function getNodejsCheckedPropertyDeclaration(
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

function asNodeSubject(subject: unknown): Node | undefined {
  return typeof subject === "object" &&
    subject !== null &&
    typeof (subject as { readonly Kind?: unknown }).Kind === "number"
    ? subject as Node
    : undefined;
}

function getNodeField(node: Node | undefined, field: string): unknown {
  if (node === undefined) {
    return undefined;
  }
  const record = node as unknown as Record<string, unknown>;
  const exact = Object.prototype.hasOwnProperty.call(record, field) ? record[field] : undefined;
  if (exact !== undefined) {
    return exact;
  }
  const alternate = `${field[0]!.toLowerCase()}${field.slice(1)}`;
  return Object.prototype.hasOwnProperty.call(record, alternate) ? record[alternate] : undefined;
}

function isNodejsProviderModule(moduleSpecifier: string | undefined): boolean {
  return moduleSpecifier === nodePathModuleSpecifier ||
    moduleSpecifier === nodeFsModuleSpecifier ||
    moduleSpecifier === nodeCryptoModuleSpecifier ||
    moduleSpecifier === nodeOsModuleSpecifier ||
    moduleSpecifier === nodeProcessModuleSpecifier;
}

function getNodejsCallTargetMembers(moduleSpecifier: string, exportName: string): readonly TargetMember[] {
  switch (moduleSpecifier) {
    case nodePathModuleSpecifier:
      return getNodePathTargetMembers(exportName);
    case nodeFsModuleSpecifier:
      return getNodeFsTargetMembers(exportName);
    case nodeCryptoModuleSpecifier:
      return getNodeCryptoTargetMembers(exportName);
    case nodeOsModuleSpecifier:
      return getNodeOsTargetMembers(exportName);
    case nodeProcessModuleSpecifier:
      return getNodeProcessTargetMembers(exportName);
    default:
      return [];
  }
}

function getNodejsPropertyTargetMembers(moduleSpecifier: string, exportName: string): readonly TargetMember[] {
  switch (moduleSpecifier) {
    case nodePathModuleSpecifier:
      return getNodePathPropertyMembers(exportName);
    case nodeOsModuleSpecifier:
      return getNodeOsPropertyMembers(exportName);
    case nodeProcessModuleSpecifier:
      return getNodeProcessPropertyMembers(exportName);
    default:
      return [];
  }
}

function getStaticTargetOperation(member: TargetMember): string {
  return member.declaringType?.kind === "target-named"
    ? `${member.declaringType.id}.${member.targetName}`
    : member.targetName;
}

export function getCsharpNodejsStaticPropertyOperation(
  moduleSpecifier: string,
  exportName: string,
): TargetOperationFact | undefined {
  const member = selectSingleTargetMember(getNodejsPropertyTargetMembers(moduleSpecifier, exportName));
  return member === undefined
    ? undefined
    : {
        operationId: member.id,
        operationKind: "property",
        targetOperation: getStaticTargetOperation(member),
        ...(member.returnType !== undefined ? { resultType: member.returnType } : {}),
      };
}

function selectSingleTargetMember(candidates: readonly TargetMember[]): TargetMember | undefined {
  return candidates.length === 1 ? candidates[0] : undefined;
}

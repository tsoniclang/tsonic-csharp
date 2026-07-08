import {
  providerVirtualDeclarationFactKey,
  targetBindingFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionFactSubject,
  ExtensionLifecycleContext,
  Node,
  SourceFile,
  TargetBindingFact,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  getNodeField,
  visitAstReaderNodes,
} from "./ast-utils.js";
import {
  parseDotnetModuleSpecifier,
} from "../../providers/dotnet/module-specifier.js";
import {
  getAliasedSymbolIfAvailable,
} from "./symbol-utils.js";
import type {
  CsharpTargetTypeResolutionHost,
} from "./target-type-resolution.js";
import {
  csharpApplyExternAliasToTargetBinding,
} from "./target-types.js";

export function recordCsharpProviderTargetBindingFactsBeforeFinalization(
  lifecycleContext: ExtensionLifecycleContext,
  host: CsharpTargetTypeResolutionHost,
): void {
  const compiler = lifecycleContext.compiler;
  for (const sourceFile of compiler.getSourceFiles()) {
    if (sourceFile === undefined) {
      continue;
    }
    visitAstReaderNodes(compiler.ast, sourceFile, (node) => {
      if (compiler.ast.kindName(node) !== "KindTypeReference") {
        return;
      }
      const binding = getCsharpProviderTargetBindingForTypeReference(node, sourceFile, lifecycleContext, host);
      if (binding === undefined || lifecycleContext.host.facts.get(node, targetBindingFactKey) !== undefined) {
        return;
      }
      lifecycleContext.host.facts.set(node, targetBindingFactKey, binding, [{
        message: "C# provider target binding fact attached to a TSTS-selected type reference from provider virtual declaration identity.",
      }]);
    });
  }
}

function getCsharpProviderTargetBindingForTypeReference(
  node: Node,
  sourceFile: SourceFile,
  lifecycleContext: ExtensionLifecycleContext,
  host: CsharpTargetTypeResolutionHost,
): TargetBindingFact | undefined {
  const typeName = asNodeSubject(getNodeField(node, "TypeName"));
  if (typeName === undefined) {
    return undefined;
  }
  const subjects = getProviderTargetBindingSubjectsForTypeName(typeName, sourceFile, lifecycleContext);
  for (const subject of subjects) {
    const virtualDeclaration = lifecycleContext.host.factResolver.resolve(subject, providerVirtualDeclarationFactKey);
    const targetIdentity = virtualDeclaration?.targetIdentity;
    if (virtualDeclaration === undefined || targetIdentity?.kind !== "target-named") {
      continue;
    }
    const binding = host.getCsharpTargetBindingByTargetId(targetIdentity.id);
    if (binding !== undefined) {
      const parsedModule = parseDotnetModuleSpecifier(virtualDeclaration.moduleSpecifier);
      return parsedModule?.externAlias === undefined
        ? binding
        : csharpApplyExternAliasToTargetBinding(binding, parsedModule.externAlias);
    }
  }
  return undefined;
}

function getProviderTargetBindingSubjectsForTypeName(
  typeName: Node,
  sourceFile: SourceFile,
  lifecycleContext: ExtensionLifecycleContext,
): readonly ExtensionFactSubject[] {
  const compiler = lifecycleContext.compiler;
  const checker = lifecycleContext.compiler.checker;
  const nodeSubjects = providerBindingTypeNameNodes(typeName, compiler.ast);
  const subjects: ExtensionFactSubject[] = [];
  for (const subject of nodeSubjects) {
    if (subject === undefined) {
      continue;
    }
    subjects.push(subject);
    if (!compiler.ast.is.IsIdentifier(subject) && !compiler.ast.is.IsPrivateIdentifier(subject)) {
      continue;
    }
    const symbol = checker.getSymbolAtLocation(subject, { sourceFile });
    const resolvedSymbol = checker.getResolvedSymbolOrNil(subject, { sourceFile }) ?? undefined;
    const aliasedSymbol = getAliasedSymbolIfAvailable(checker, symbol, sourceFile);
    const aliasedResolvedSymbol = getAliasedSymbolIfAvailable(checker, resolvedSymbol, sourceFile);
    pushFactSubject(subjects, symbol);
    pushFactSubject(subjects, aliasedSymbol);
    pushFactSubject(subjects, resolvedSymbol);
    pushFactSubject(subjects, aliasedResolvedSymbol);
  }
  return Array.from(new Set(subjects));
}

function pushFactSubject(
  subjects: ExtensionFactSubject[],
  subject: ExtensionFactSubject | undefined,
): void {
  if (subject !== undefined) {
    subjects.push(subject);
  }
}

function providerBindingTypeNameNodes(
  typeName: Node,
  ast: ExtensionLifecycleContext["compiler"]["ast"],
): readonly Node[] {
  const nodes: Node[] = [typeName];
  if (!ast.is.IsQualifiedName(typeName)) {
    return nodes;
  }
  for (let current: Node | undefined = typeName; current !== undefined && ast.is.IsQualifiedName(current);) {
    const right = asNodeSubject(getNodeField(current, "Right"));
    const left = asNodeSubject(getNodeField(current, "Left"));
    if (right !== undefined) {
      nodes.push(right);
    }
    if (left !== undefined && !ast.is.IsQualifiedName(left)) {
      nodes.push(left);
    }
    current = left;
  }
  return nodes;
}

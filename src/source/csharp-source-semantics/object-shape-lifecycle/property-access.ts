import {
  providerVirtualDeclarationFactKey,
  targetOperationFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionObservationContext,
  Node,
  SourceFile,
} from "@tsonic/tsts";
import {
  csharpTargetOperationFactKey,
  resolveCsharpObjectShapeMemberByFinalizedSourceName,
} from "../../csharp-facts.js";
import {
  asNodeSubject,
  getNodeField,
  visitAstReaderNodes,
} from "../ast-utils.js";
import {
  csharpTargetMemberOperation,
  targetOperation,
} from "../operations.js";
import {
  createRuntimeCarrierLifecycleObservationContext,
} from "../runtime-carriers.js";
import {
  setRuntimeCarrierFactIfAbsent,
} from "../runtime-carrier-lifecycle/fact-writes.js";
import {
  getSymbolForDeclarationLookup,
} from "../symbol-utils.js";
import {
  getSourceNameNodeText,
} from "./source-name.js";
import type {
  CsharpObjectShapeLifecycleHost,
} from "./types.js";

export function recordCsharpObjectShapePropertyAccessFactsBeforeFinalization(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  host: CsharpObjectShapeLifecycleHost,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  const context = createRuntimeCarrierLifecycleObservationContext(lifecycleContext);
  const projectSourceFiles = compiler.getSourceFiles().filter((sourceFile): sourceFile is SourceFile =>
    sourceFile !== undefined && sourceFile.IsDeclarationFile !== true);
  for (const sourceFile of compiler.getSourceFiles()) {
    if (sourceFile === undefined || sourceFile.IsDeclarationFile === true) {
      continue;
    }
    visitAstReaderNodes(compiler.ast, sourceFile, (node) => {
      if (!compiler.ast.is.IsPropertyAccessExpression(node) || lifecycleContext.host.facts.get(node, targetOperationFactKey) !== undefined) {
        return;
      }
      if (isProjectSourceModuleStaticValuePropertyAccess(node, sourceFile, projectSourceFiles, compiler)) {
        return;
      }
      if (isNamespaceImportReceiverPropertyAccess(node, sourceFile, compiler)) {
        return;
      }
      const receiver = asNodeSubject(getNodeField(node, "Expression"));
      if (isProviderSelectedPropertyAccess(node, context)) {
        return;
      }
      const propertyNameNode = asNodeSubject(getNodeField(node, "name"));
      const propertyName = getSourceNameNodeText(propertyNameNode, compiler.ast);
      if (receiver === undefined || propertyName.length === 0) {
        return;
      }
      const objectShape = host.getRecordedCsharpObjectShapeFactForSubject(receiver, context) ??
        host.getRecordedCsharpObjectShapeFactForSubject(getSymbolForDeclarationLookup(compiler.ast, compiler.checker, receiver, sourceFile), context);
      if (objectShape === undefined) {
        return;
      }
      const memberLookup = resolveCsharpObjectShapeMemberByFinalizedSourceName(objectShape, propertyName, "checked-property-access");
      if (memberLookup.kind !== "resolved") {
        return;
      }
      const member = memberLookup.member;
      const operationId = `tsonic.csharp.objectShape.${propertyName}`;
      lifecycleContext.host.facts.set(node, targetOperationFactKey, targetOperation(
        operationId,
        member.memberKind === "method" ? "method" : "property",
        member.targetName,
        { resultType: member.type },
      ), [{ message: "C# object-shape property access selected from finalized structural shape fact." }]);
      lifecycleContext.host.facts.set(node, csharpTargetOperationFactKey, csharpTargetMemberOperation(operationId, member.memberKind === "method" ? "method" : "property", member.targetName, {
        resultType: member.type,
      }), [{ message: "C# object-shape member operation recorded from finalized structural shape fact." }]);
      setRuntimeCarrierFactIfAbsent(lifecycleContext, node, { carrier: member.type }, "C# object-shape property access result carrier recorded from finalized structural shape fact.");
    });
  }
}

function isProviderSelectedPropertyAccess(
  node: Node,
  context: ExtensionObservationContext,
): boolean {
  return context.host.facts.get(node, providerVirtualDeclarationFactKey) !== undefined;
}

function isNamespaceImportReceiverPropertyAccess(
  node: Node,
  sourceFile: SourceFile,
  compiler: NonNullable<ExtensionObservationContext["compiler"]>,
): boolean {
  const propertyAccess = compiler.ast.as.AsPropertyAccessExpression(node);
  const receiver = asNodeSubject(propertyAccess?.Expression);
  if (receiver === undefined || !compiler.ast.is.IsIdentifier(receiver)) {
    return false;
  }
  const receiverName = compiler.ast.text(receiver);
  let namespaceImportMatch = false;
  visitAstReaderNodes(compiler.ast, sourceFile, (candidate) => {
    if (namespaceImportMatch || !compiler.ast.is.IsImportDeclaration(candidate)) {
      return;
    }
    const importDeclaration = compiler.ast.as.AsImportDeclaration(candidate);
    const rawImportClause = asNodeSubject(importDeclaration?.ImportClause);
    const importClause = rawImportClause === undefined
      ? undefined
      : compiler.ast.as.AsImportClause(rawImportClause);
    const namedBindings = importClause?.NamedBindings;
    if (namedBindings === undefined || compiler.ast.as.AsNamespaceImport(namedBindings) === undefined) {
      return;
    }
    const name = compiler.ast.name(namedBindings);
    namespaceImportMatch = name !== undefined && compiler.ast.text(name) === receiverName;
  });
  return namespaceImportMatch;
}

function isProjectSourceModuleStaticValuePropertyAccess(
  node: Node,
  sourceFile: SourceFile,
  projectSourceFiles: readonly SourceFile[],
  compiler: NonNullable<ExtensionObservationContext["compiler"]>,
): boolean {
  const propertyAccess = compiler.ast.as.AsPropertyAccessExpression(node);
  const receiver = asNodeSubject(propertyAccess?.Expression);
  if (receiver === undefined || !compiler.ast.is.IsIdentifier(receiver)) {
    return false;
  }
  const receiverSymbol = compiler.checker.getSymbolAtLocation(receiver, { sourceFile }) ??
    compiler.checker.getResolvedSymbolOrNil(receiver, { sourceFile });
  return (receiverSymbol?.Declarations ?? []).some((declaration) => {
    if (declaration === undefined) {
      return false;
    }
    const declarationSourceFile = compiler.ast.getSourceFile(declaration);
    return declarationSourceFile !== undefined &&
      declarationSourceFile !== sourceFile &&
      projectSourceFiles.some((candidate) => candidate === declarationSourceFile) &&
      isModuleStaticValueDeclaration(declaration, compiler);
  });
}

function isModuleStaticValueDeclaration(
  declaration: Node,
  compiler: NonNullable<ExtensionObservationContext["compiler"]>,
): boolean {
  return compiler.ast.is.IsFunctionDeclaration(declaration) ||
    compiler.ast.is.IsVariableDeclaration(declaration) ||
    compiler.ast.is.IsExportAssignment(declaration);
}

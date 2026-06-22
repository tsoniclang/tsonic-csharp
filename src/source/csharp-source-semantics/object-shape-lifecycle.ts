import {
  runtimeCarrierFactKey,
  targetOperationFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  Node,
  SourceFile,
} from "@tsonic/tsts";
import {
  csharpObjectShapeFactKey,
  csharpTargetOperationFactKey,
} from "../csharp-facts.js";
import type {
  CsharpObjectShapeFact,
} from "../csharp-facts.js";
import {
  asNodeSubject,
  getNodeField,
  getNodeList,
  visitAstReaderNodes,
} from "./ast-utils.js";
import {
  getObjectShapeTargetName,
} from "./object-shape-identity.js";
import {
  csharpTargetMemberOperation,
  targetOperation,
} from "./operations.js";
import {
  getSymbolForDeclarationLookup,
} from "./symbol-utils.js";
import {
  csharpTargetNamedType,
} from "./target-types.js";
import {
  createRuntimeCarrierLifecycleObservationContext,
  getRuntimeCarrierSubjectType,
} from "./runtime-carriers.js";

export interface CsharpObjectShapeLifecycleHost {
  readonly getCsharpObjectShapeFactForSubject: (
    subject: ExtensionFactSubject | undefined,
    context: ExtensionObservationContext,
  ) => CsharpObjectShapeFact | undefined;
  readonly getRecordedCsharpObjectShapeFactForSubject: (
    subject: ExtensionFactSubject | undefined,
    context: ExtensionObservationContext,
  ) => CsharpObjectShapeFact | undefined;
}

export function recordCsharpObjectRestBindingFactsBeforeFinalization(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  host: CsharpObjectShapeLifecycleHost,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  const context = createRuntimeCarrierLifecycleObservationContext(lifecycleContext);
  for (const sourceFile of compiler.getSourceFiles()) {
    if (sourceFile === undefined || sourceFile.IsDeclarationFile === true) {
      continue;
    }
    visitAstReaderNodes(compiler.ast, sourceFile, (node) => {
      if (!isObjectRestBindingElement(node, compiler.ast)) {
        return;
      }
      const restName = asNodeSubject(getNodeField(node, "name"));
      const sourceExpression = getObjectBindingPatternSourceExpression(node);
      if (restName === undefined || sourceExpression === undefined) {
        return;
      }
      const sourceShape = host.getCsharpObjectShapeFactForSubject(sourceExpression, context);
      if (sourceShape === undefined) {
        return;
      }
      const omitted = getObjectBindingPatternOmittedNames(node, compiler.ast);
      const members = sourceShape.members.filter((member) => !omitted.has(member.sourceName));
      if (members.length === sourceShape.members.length || members.length === 0) {
        return;
      }
      const targetName = getObjectShapeTargetName("__TsonicShape", members);
      const restShape = {
        targetType: csharpTargetNamedType(targetName, undefined, { kind: "named", name: targetName }),
        members,
      } satisfies CsharpObjectShapeFact;
      recordCsharpObjectRestBindingFact(lifecycleContext, sourceFile, [node, restName], restShape);
    });
  }
}

export function recordCsharpObjectShapePropertyAccessFactsBeforeFinalization(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  host: CsharpObjectShapeLifecycleHost,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  const context = createRuntimeCarrierLifecycleObservationContext(lifecycleContext);
  for (const sourceFile of compiler.getSourceFiles()) {
    if (sourceFile === undefined || sourceFile.IsDeclarationFile === true) {
      continue;
    }
    visitAstReaderNodes(compiler.ast, sourceFile, (node) => {
      if (!compiler.ast.is.IsPropertyAccessExpression(node) || lifecycleContext.host.facts.get(node, targetOperationFactKey) !== undefined) {
        return;
      }
      const receiver = asNodeSubject(getNodeField(node, "Expression"));
      const propertyName = getSourceNameNodeText(asNodeSubject(getNodeField(node, "name")), compiler.ast);
      if (receiver === undefined || propertyName.length === 0) {
        return;
      }
      const objectShape = host.getRecordedCsharpObjectShapeFactForSubject(receiver, context) ??
        host.getRecordedCsharpObjectShapeFactForSubject(getSymbolForDeclarationLookup(compiler.ast, compiler.checker, receiver, sourceFile), context);
      const member = objectShape?.members.find((candidate) => candidate.sourceName === propertyName);
      if (objectShape === undefined || member === undefined) {
        return;
      }
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
    });
  }
}

function isObjectRestBindingElement(
  node: Node,
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
): boolean {
  const parent = asNodeSubject(getNodeField(node, "Parent"));
  return ast.kindName(node) === "KindBindingElement" &&
    getNodeField(node, "DotDotDotToken") !== undefined &&
    ast.kindName(parent) === "KindObjectBindingPattern";
}

function getObjectBindingPatternSourceExpression(restBindingElement: Node): Node | undefined {
  const bindingPattern = asNodeSubject(getNodeField(restBindingElement, "Parent"));
  const bindingOwner = asNodeSubject(getNodeField(bindingPattern, "Parent"));
  if (bindingOwner === undefined) {
    return undefined;
  }
  return asNodeSubject(getNodeField(bindingOwner, "Initializer")) ??
    asNodeSubject(getNodeField(bindingOwner, "Type"));
}

function getObjectBindingPatternOmittedNames(
  restBindingElement: Node,
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
): ReadonlySet<string> {
  const bindingPattern = asNodeSubject(getNodeField(restBindingElement, "Parent"));
  const omitted = new Set<string>();
  for (const element of getNodeList(getNodeField(bindingPattern, "Elements"))) {
    if (element === restBindingElement || getNodeField(element, "DotDotDotToken") !== undefined) {
      continue;
    }
    const sourceName = getObjectBindingElementSourceName(element, ast);
    if (sourceName.length > 0) {
      omitted.add(sourceName);
    }
  }
  return omitted;
}

function getObjectBindingElementSourceName(
  bindingElement: Node,
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
): string {
  const propertyName = asNodeSubject(getNodeField(bindingElement, "PropertyName"));
  const sourceNameNode = propertyName ?? asNodeSubject(getNodeField(bindingElement, "name"));
  return getSourceNameNodeText(sourceNameNode, ast);
}

function getSourceNameNodeText(
  node: Node | undefined,
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
): string {
  if (node === undefined) {
    return "";
  }
  if (ast.is.IsIdentifier(node) || ast.is.IsStringLiteral(node)) {
    return ast.text(node);
  }
  return "";
}

function recordCsharpObjectRestBindingFact(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  sourceFile: SourceFile,
  subjects: readonly Node[],
  restShape: CsharpObjectShapeFact,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  const runtimeCarrier = { carrier: restShape.targetType };
  const evidence = [{ message: "C# object rest binding shape recorded from finalized source object-shape facts." }];
  for (const subject of subjects) {
    lifecycleContext.host.facts.set(subject, csharpObjectShapeFactKey, restShape, evidence);
    lifecycleContext.host.facts.set(subject, runtimeCarrierFactKey, runtimeCarrier, evidence);
    const symbol = getSymbolForDeclarationLookup(compiler.ast, compiler.checker, subject, sourceFile);
    if (symbol !== undefined) {
      lifecycleContext.host.facts.set(symbol, csharpObjectShapeFactKey, restShape, evidence);
      lifecycleContext.host.facts.set(symbol, runtimeCarrierFactKey, runtimeCarrier, evidence);
    }
    const type = getRuntimeCarrierSubjectType(compiler, sourceFile, subject);
    if (type !== undefined) {
      lifecycleContext.host.facts.set(type, csharpObjectShapeFactKey, restShape, evidence);
      lifecycleContext.host.facts.set(type, runtimeCarrierFactKey, runtimeCarrier, evidence);
      if (type.symbol !== undefined) {
        lifecycleContext.host.facts.set(type.symbol, csharpObjectShapeFactKey, restShape, evidence);
        lifecycleContext.host.facts.set(type.symbol, runtimeCarrierFactKey, runtimeCarrier, evidence);
      }
    }
  }
}

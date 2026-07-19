import type {
  ExtensionFactSubject,
  ExtensionLifecycleContext,
  ExtensionObservationContext,
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  CsharpObjectShapeFact,
} from "../../csharp-facts.js";
import {
  recordCsharpPropagatedRuntimeCarrierFact,
  csharpObjectShapeFactKey,
  resolveCsharpObjectShapeMemberByFinalizedSourceName,
} from "../../csharp-facts.js";
import {
  asNodeSubject,
  getNodeField,
  getNodeList,
} from "../ast-utils.js";
import type {
  CsharpObjectShapeSemanticsHost,
} from "../object-shape-types.js";
import {
  getObjectShapeSymbolForQueryableNode,
} from "./semantic-subjects.js";

export type CsharpObjectShapeFactResolver = (
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
  host: CsharpObjectShapeSemanticsHost,
) => CsharpObjectShapeFact | undefined;

export function recordObjectBindingMemberRuntimeCarriers(
  lifecycleContext: Pick<ExtensionLifecycleContext, "host" | "compiler">,
  sourceFile: SourceFile,
  node: Node,
  context: ExtensionObservationContext,
  host: CsharpObjectShapeSemanticsHost,
  resolveObjectShape: CsharpObjectShapeFactResolver,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined || compiler.ast.kindName(node) !== "KindObjectBindingPattern") {
    return;
  }
  const pattern = node;
  const bindingOwner = asNodeSubject(getNodeField(pattern, "Parent"));
  const sourceExpression = asNodeSubject(getNodeField(bindingOwner, "Initializer"));
  const declaredType = asNodeSubject(getNodeField(bindingOwner, "Type"));
  const objectShape = resolveObjectShape(sourceExpression, context, host) ??
    resolveObjectShape(declaredType, context, host) ??
    resolveObjectShape(bindingOwner, context, host);
  if (objectShape === undefined) {
    return;
  }
  const evidence = [{ message: "C# runtime carrier propagated from finalized object-shape destructuring member facts." }];
  for (const bindingElement of getNodeList(getNodeField(pattern, "Elements"))) {
    if (getNodeField(bindingElement, "DotDotDotToken") !== undefined) {
      continue;
    }
    const bindingName = asNodeSubject(getNodeField(bindingElement, "name"));
    if (bindingName === undefined || compiler.ast.kindName(bindingName) !== "KindIdentifier") {
      continue;
    }
    const sourceName = getObjectBindingElementSourceName(compiler.ast, bindingElement);
    if (sourceName === undefined) {
      continue;
    }
    const memberLookup = resolveCsharpObjectShapeMemberByFinalizedSourceName(objectShape, sourceName, "checked-object-binding-property");
    if (memberLookup.kind !== "resolved") {
      continue;
    }
    const member = memberLookup.member;
    const fact = { carrier: member.type };
    recordCsharpPropagatedRuntimeCarrierFact(lifecycleContext.host.facts, bindingElement, fact, evidence);
    recordCsharpPropagatedRuntimeCarrierFact(lifecycleContext.host.facts, bindingName, fact, evidence);
    const bindingObjectShape = resolveObjectShape(bindingName, context, host);
    if (bindingObjectShape !== undefined) {
      lifecycleContext.host.facts.set(bindingElement, csharpObjectShapeFactKey, bindingObjectShape, evidence);
      lifecycleContext.host.facts.set(bindingName, csharpObjectShapeFactKey, bindingObjectShape, evidence);
    }
    const symbol = getObjectShapeSymbolForQueryableNode(bindingName, sourceFile, context);
    if (symbol !== undefined) {
      recordCsharpPropagatedRuntimeCarrierFact(lifecycleContext.host.facts, symbol, fact, evidence);
      if (bindingObjectShape !== undefined) {
        lifecycleContext.host.facts.set(symbol, csharpObjectShapeFactKey, bindingObjectShape, evidence);
      }
    }
  }
}

function getObjectBindingElementSourceName(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  bindingElement: Node,
): string | undefined {
  const propertyName = asNodeSubject(getNodeField(bindingElement, "PropertyName")) ??
    asNodeSubject(getNodeField(bindingElement, "name"));
  if (propertyName === undefined) {
    return undefined;
  }
  const kind = ast.kindName(propertyName);
  return kind === "KindIdentifier" || kind === "KindStringLiteral"
    ? ast.text(propertyName)
    : undefined;
}

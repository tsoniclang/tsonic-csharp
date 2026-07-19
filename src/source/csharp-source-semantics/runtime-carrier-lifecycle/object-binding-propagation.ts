import type {
  ExtensionObservationContext,
  Node,
  SourceFile,
} from "@tsonic/tsts";
import {
  recordCsharpPropagatedRuntimeCarrierFact,
} from "../../csharp-facts.js";
import {
  asNodeSubject,
  getNodeField,
  getNodeList,
} from "../ast-utils.js";
import {
  createRuntimeCarrierLifecycleObservationContext,
} from "../runtime-carrier-context.js";
import {
  getRuntimeCarrierSubjectSymbol,
} from "../runtime-carrier-subjects.js";
import type {
  CsharpRuntimeCarrierSemanticsHost,
} from "../runtime-carrier-types.js";
import type {
  RuntimeCarrierLifecycleFactsContext,
} from "./context.js";
import {
  resolveCsharpObjectShapeMemberByFinalizedSourceName,
} from "../../csharp-facts.js";

export function propagateCsharpRuntimeCarrierFactFromObjectBindingDeclaration(
  lifecycleContext: RuntimeCarrierLifecycleFactsContext,
  sourceFile: SourceFile,
  node: Node,
  host: CsharpRuntimeCarrierSemanticsHost,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  const kind = compiler.ast.kindName(node);
  if (kind !== "KindVariableDeclaration" && kind !== "KindParameter") {
    return;
  }
  const pattern = asNodeSubject(getNodeField(node, "name"));
  if (pattern === undefined || compiler.ast.kindName(pattern) !== "KindObjectBindingPattern") {
    return;
  }
  const sourceExpression = kind === "KindVariableDeclaration"
    ? asNodeSubject(getNodeField(node, "Initializer"))
    : undefined;
  const declaredType = asNodeSubject(getNodeField(node, "Type"));
  const context = createRuntimeCarrierLifecycleObservationContext(lifecycleContext);
  const objectShape = host.getCsharpObjectShapeFactForSubject(sourceExpression, context) ??
    host.getCsharpObjectShapeFactForSubject(declaredType, context);
  if (objectShape === undefined) {
    return;
  }
  for (const bindingElement of getNodeList(getNodeField(pattern, "Elements"))) {
    propagateCsharpRuntimeCarrierFactFromObjectBindingElement(lifecycleContext, sourceFile, bindingElement, objectShape);
  }
}

function propagateCsharpRuntimeCarrierFactFromObjectBindingElement(
  lifecycleContext: RuntimeCarrierLifecycleFactsContext,
  sourceFile: SourceFile,
  node: Node,
  objectShape: NonNullable<ReturnType<CsharpRuntimeCarrierSemanticsHost["getCsharpObjectShapeFactForSubject"]>>,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined || compiler.ast.kindName(node) !== "KindBindingElement") {
    return;
  }
  const bindingName = asNodeSubject(getNodeField(node, "name"));
  if (bindingName === undefined || compiler.ast.kindName(bindingName) !== "KindIdentifier") {
    return;
  }
  const sourceName = getObjectBindingElementSourceName(compiler.ast, node);
  if (sourceName === undefined) {
    return;
  }
  const memberLookup = resolveCsharpObjectShapeMemberByFinalizedSourceName(objectShape, sourceName, "checked-object-binding-property");
  if (memberLookup.kind !== "resolved") {
    return;
  }
  const member = memberLookup.member;
  const fact = { carrier: member.type };
  const evidence = [{ message: "C# runtime carrier propagated from finalized object-shape destructuring member facts." }];
  recordCsharpPropagatedRuntimeCarrierFact(lifecycleContext.host.facts, node, fact, evidence);
  recordCsharpPropagatedRuntimeCarrierFact(lifecycleContext.host.facts, bindingName, fact, evidence);
  const symbol = getRuntimeCarrierSubjectSymbol(compiler, sourceFile, bindingName);
  if (symbol !== undefined) {
    recordCsharpPropagatedRuntimeCarrierFact(lifecycleContext.host.facts, symbol, fact, evidence);
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
  if (kind !== "KindIdentifier" && kind !== "KindStringLiteral") {
    return undefined;
  }
  return ast.text(propertyName);
}

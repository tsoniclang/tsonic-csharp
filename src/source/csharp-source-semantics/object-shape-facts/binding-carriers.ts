import {
  runtimeCarrierFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  CsharpObjectShapeFact,
} from "../../csharp-facts.js";
import {
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
  getSafeObjectShapeSymbol,
} from "./semantic-subjects.js";

export type CsharpObjectShapeFactResolver = (
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
  host: CsharpObjectShapeSemanticsHost,
) => CsharpObjectShapeFact | undefined;

export function recordObjectBindingMemberRuntimeCarriers(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  sourceFile: SourceFile,
  node: Node,
  context: ExtensionObservationContext,
  host: CsharpObjectShapeSemanticsHost,
  resolveObjectShape: CsharpObjectShapeFactResolver,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined || compiler.ast.kindName(node) !== "KindVariableDeclaration") {
    return;
  }
  const pattern = asNodeSubject(getNodeField(node, "name"));
  if (pattern === undefined || compiler.ast.kindName(pattern) !== "KindObjectBindingPattern") {
    return;
  }
  const sourceExpression = asNodeSubject(getNodeField(node, "Initializer"));
  const declaredType = asNodeSubject(getNodeField(node, "Type"));
  const objectShape = resolveObjectShape(sourceExpression, context, host) ??
    resolveObjectShape(declaredType, context, host);
  if (objectShape === undefined) {
    return;
  }
  const evidence = [{ message: "C# runtime carrier propagated from finalized object-shape destructuring member facts." }];
  for (const bindingElement of getNodeList(getNodeField(pattern, "Elements"))) {
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
    lifecycleContext.host.facts.set(bindingElement, runtimeCarrierFactKey, fact, evidence);
    lifecycleContext.host.facts.set(bindingName, runtimeCarrierFactKey, fact, evidence);
    const symbol = getSafeObjectShapeSymbol(bindingName, sourceFile, context);
    if (symbol !== undefined) {
      lifecycleContext.host.facts.set(symbol, runtimeCarrierFactKey, fact, evidence);
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

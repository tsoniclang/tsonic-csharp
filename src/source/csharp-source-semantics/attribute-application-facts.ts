import {
  attributeFactKey,
} from "@tsonic/tsts";
import type {
  AttributeFact,
  ExtensionFactSubject,
  ExtensionLifecycleContext,
  Node,
} from "@tsonic/tsts";
import {
  csharpAttributeApplicationFactKey,
} from "../csharp-facts.js";
import type {
  CsharpAttributeApplicationFact,
} from "../csharp-facts.js";
import {
  asNodeSubject,
  getAstReaderChildNodes,
  getNodeField,
} from "./ast-utils.js";

interface AttributeApplicationState {
  readonly applicationTarget: ExtensionFactSubject;
  readonly applicationPlacement?: CsharpAttributeApplicationFact["applicationPlacement"];
  readonly applicationParameterName?: string;
  readonly applicationTargetSpecifier?: string;
}

export function recordCsharpAttributeApplicationFactsBeforeFinalization(
  lifecycleContext: ExtensionLifecycleContext,
): void {
  for (const sourceFile of lifecycleContext.compiler.getSourceFiles()) {
    if (sourceFile === undefined || sourceFile.IsDeclarationFile === true) {
      continue;
    }
    walkAttributeApplicationFacts(lifecycleContext, sourceFile);
  }
}

function walkAttributeApplicationFacts(
  lifecycleContext: ExtensionLifecycleContext,
  node: Node | undefined,
): void {
  if (node === undefined) {
    return;
  }
  for (const child of getAstReaderChildNodes(lifecycleContext.compiler.ast, node)) {
    walkAttributeApplicationFacts(lifecycleContext, child);
  }
  if (!lifecycleContext.compiler.ast.is.IsCallExpression(node)) {
    return;
  }
  const attribute = lifecycleContext.host.facts.get(node, attributeFactKey);
  if (attribute === undefined) {
    return;
  }
  const application = deriveAttributeApplicationFact(lifecycleContext, node, attribute);
  if (application === undefined) {
    return;
  }
  lifecycleContext.host.facts.set(
    node,
    csharpAttributeApplicationFactKey,
    application,
    [{ message: "C# attribute application fact derived from finalized source-core attribute fact and checked builder chain." }],
  );
}

function deriveAttributeApplicationFact(
  lifecycleContext: ExtensionLifecycleContext,
  addCall: Node,
  attribute: AttributeFact,
): CsharpAttributeApplicationFact | undefined {
  const callee = asNodeSubject(getNodeField(addCall, "Expression"));
  if (callee === undefined || !lifecycleContext.compiler.ast.is.IsPropertyAccessExpression(callee)) {
    return undefined;
  }
  const memberName = lifecycleContext.compiler.ast.text(lifecycleContext.compiler.ast.name(callee));
  if (memberName !== "add") {
    return undefined;
  }
  const receiver = asNodeSubject(getNodeField(callee, "Expression"));
  const state = deriveAttributeApplicationState(lifecycleContext, receiver, attribute);
  if (state === undefined) {
    return undefined;
  }
  return {
    target: attribute.target,
    attributeName: attribute.attributeName,
    ...(attribute.arguments === undefined ? {} : { arguments: attribute.arguments }),
    applicationTarget: state.applicationTarget,
    ...(state.applicationPlacement === undefined ? {} : { applicationPlacement: state.applicationPlacement }),
    ...(state.applicationParameterName === undefined ? {} : { applicationParameterName: state.applicationParameterName }),
    ...(state.applicationTargetSpecifier === undefined ? {} : { applicationTargetSpecifier: state.applicationTargetSpecifier }),
  };
}

function deriveAttributeApplicationState(
  lifecycleContext: ExtensionLifecycleContext,
  expression: Node | undefined,
  attribute: AttributeFact,
): AttributeApplicationState | undefined {
  if (expression === undefined) {
    return undefined;
  }
  const expressionAttribute = lifecycleContext.host.facts.get(expression, attributeFactKey);
  if (expressionAttribute !== undefined) {
    return { applicationTarget: expressionAttribute.target };
  }
  if (!lifecycleContext.compiler.ast.is.IsCallExpression(expression)) {
    return undefined;
  }
  const callee = asNodeSubject(getNodeField(expression, "Expression"));
  if (callee === undefined || !lifecycleContext.compiler.ast.is.IsPropertyAccessExpression(callee)) {
    return undefined;
  }
  const receiver = asNodeSubject(getNodeField(callee, "Expression"));
  const methodName = lifecycleContext.compiler.ast.text(lifecycleContext.compiler.ast.name(callee));
  switch (methodName) {
    case "property":
    case "method": {
      const selectorTarget = selectorApplicationTarget(lifecycleContext, expression);
      if (selectorTarget === undefined) {
        return undefined;
      }
      return {
        applicationTarget: selectorTarget,
        applicationPlacement: "declaration",
      };
    }
    case "constructor":
      return {
        applicationTarget: attribute.target,
        applicationPlacement: "constructor",
      };
    case "parameter": {
      const previous = deriveAttributeApplicationState(lifecycleContext, receiver, attribute);
      const parameterName = stringArgument(lifecycleContext, expression, 0);
      if (previous === undefined || parameterName === undefined) {
        return undefined;
      }
      return {
        ...previous,
        applicationParameterName: parameterName,
      };
    }
    case "target": {
      const previous = deriveAttributeApplicationState(lifecycleContext, receiver, attribute);
      const targetSpecifier = stringArgument(lifecycleContext, expression, 0);
      if (previous === undefined || targetSpecifier === undefined) {
        return undefined;
      }
      return {
        ...previous,
        applicationTargetSpecifier: targetSpecifier,
      };
    }
    default:
      return deriveAttributeApplicationState(lifecycleContext, receiver, attribute);
  }
}

function selectorApplicationTarget(
  lifecycleContext: ExtensionLifecycleContext,
  selectorCall: Node,
): ExtensionFactSubject | undefined {
  const argument = callArgument(selectorCall, 0);
  if (argument === undefined || !lifecycleContext.compiler.ast.is.IsArrowFunction(argument)) {
    return undefined;
  }
  return asNodeSubject(getNodeField(argument, "Body"));
}

function stringArgument(
  lifecycleContext: ExtensionLifecycleContext,
  call: Node,
  index: number,
): string | undefined {
  const argument = callArgument(call, index);
  if (argument === undefined) {
    return undefined;
  }
  const sourceFile = lifecycleContext.compiler.ast.getSourceFile(argument);
  const value = lifecycleContext.compiler.typeShape.getConstantValue(argument, { sourceFile });
  return typeof value === "string" ? value : undefined;
}

function callArgument(
  call: Node,
  index: number,
): Node | undefined {
  const args = (getNodeField(call, "Arguments") as { readonly Nodes?: readonly unknown[] } | undefined)?.Nodes ?? [];
  return asNodeSubject(args[index]);
}

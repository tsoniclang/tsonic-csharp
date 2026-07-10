import {
  attributeFactKey,
  selectedTargetSignatureFactKey,
} from "@tsonic/tsts";
import {
  tsonicAttributeBuilderMemberIds,
} from "@tsonic/source-core";
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
  csharpSourceSemanticsExtensionId,
} from "./identity.js";
import {
  csharpProviderDiagnostic,
} from "./diagnostics.js";
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

type AttributeApplicationStateResult =
  | { readonly kind: "ok"; readonly state: AttributeApplicationState }
  | { readonly kind: "diagnostic"; readonly diagnostic: ReturnType<typeof csharpProviderDiagnostic> };

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
  const selectedMemberId = selectedCallMemberId(addCall, lifecycleContext);
  if (
    selectedMemberId !== tsonicAttributeBuilderMemberIds.add &&
    selectedMemberId !== tsonicAttributeBuilderMemberIds.memberAdd
  ) {
    return undefined;
  }
  const receiver = asNodeSubject(getNodeField(callee, "Expression"));
  const state = deriveAttributeApplicationState(lifecycleContext, receiver, attribute);
  if (state?.kind === "diagnostic") {
    lifecycleContext.host.diagnostics.append(state.diagnostic);
    return undefined;
  }
  if (state === undefined) {
    return undefined;
  }
  return {
    attributeType: attribute.target,
    attributeName: attribute.attributeName,
    ...(attribute.arguments === undefined ? {} : { arguments: attribute.arguments }),
    applicationTarget: state.state.applicationTarget,
    ...(state.state.applicationPlacement === undefined ? {} : { applicationPlacement: state.state.applicationPlacement }),
    ...(state.state.applicationParameterName === undefined ? {} : { applicationParameterName: state.state.applicationParameterName }),
    ...(state.state.applicationTargetSpecifier === undefined ? {} : { applicationTargetSpecifier: state.state.applicationTargetSpecifier }),
  };
}

function deriveAttributeApplicationState(
  lifecycleContext: ExtensionLifecycleContext,
  expression: Node | undefined,
  attribute: AttributeFact,
): AttributeApplicationStateResult | undefined {
  if (expression === undefined) {
    return undefined;
  }
  const expressionAttribute = lifecycleContext.host.facts.get(expression, attributeFactKey);
  if (expressionAttribute !== undefined) {
    return { kind: "ok", state: { applicationTarget: expressionAttribute.target } };
  }
  if (!lifecycleContext.compiler.ast.is.IsCallExpression(expression)) {
    return undefined;
  }
  const callee = asNodeSubject(getNodeField(expression, "Expression"));
  if (callee === undefined || !lifecycleContext.compiler.ast.is.IsPropertyAccessExpression(callee)) {
    return undefined;
  }
  const receiver = asNodeSubject(getNodeField(callee, "Expression"));
  const selectedMemberId = selectedCallMemberId(expression, lifecycleContext);
  switch (selectedMemberId) {
    case tsonicAttributeBuilderMemberIds.property:
    case tsonicAttributeBuilderMemberIds.method: {
      const selectorTarget = selectorApplicationTarget(lifecycleContext, expression);
      if (selectorTarget === undefined) {
        return {
          kind: "diagnostic",
          diagnostic: attributeBuilderDiagnostic(
            lifecycleContext,
            "SOURCE_SEMANTICS_ATTRIBUTE_SELECTOR_TARGET_NOT_PROVEN",
            9100168,
            `C# attribute ${selectedMemberId === tsonicAttributeBuilderMemberIds.property ? "property" : "method"} selector must return a checked source member expression before the attribute can be emitted.`,
            expression,
          ),
        };
      }
      return {
        kind: "ok",
        state: {
          applicationTarget: selectorTarget,
          applicationPlacement: "declaration",
        },
      };
    }
    case tsonicAttributeBuilderMemberIds.constructor:
      {
        const previous = deriveAttributeApplicationState(lifecycleContext, receiver, attribute);
        if (previous === undefined || previous.kind === "diagnostic") {
          return previous;
        }
        return {
          kind: "ok",
          state: {
            ...previous.state,
            applicationPlacement: "constructor",
          },
        };
      }
    case tsonicAttributeBuilderMemberIds.parameter: {
      const previous = deriveAttributeApplicationState(lifecycleContext, receiver, attribute);
      if (previous === undefined || previous.kind === "diagnostic") {
        return previous;
      }
      const parameterName = stringArgument(lifecycleContext, expression, 0);
      if (parameterName === undefined) {
        return {
          kind: "diagnostic",
          diagnostic: attributeBuilderDiagnostic(
            lifecycleContext,
            "SOURCE_SEMANTICS_ATTRIBUTE_PARAMETER_NAME_NOT_PROVEN",
            9100169,
            "C# attribute parameter selector must use a statically proven string-literal parameter name.",
            expression,
          ),
        };
      }
      return {
        kind: "ok",
        state: {
          ...previous.state,
          applicationParameterName: parameterName,
        },
      };
    }
    case tsonicAttributeBuilderMemberIds.target: {
      const previous = deriveAttributeApplicationState(lifecycleContext, receiver, attribute);
      if (previous === undefined || previous.kind === "diagnostic") {
        return previous;
      }
      const targetSpecifier = stringArgument(lifecycleContext, expression, 0);
      if (targetSpecifier === undefined) {
        return {
          kind: "diagnostic",
          diagnostic: attributeBuilderDiagnostic(
            lifecycleContext,
            "SOURCE_SEMANTICS_ATTRIBUTE_TARGET_SPECIFIER_NOT_PROVEN",
            9100170,
            "C# attribute target selector must use a statically proven string-literal target specifier.",
            expression,
          ),
        };
      }
      return {
        kind: "ok",
        state: {
          ...previous.state,
          applicationTargetSpecifier: targetSpecifier,
        },
      };
    }
    default:
      return undefined;
  }
}

function attributeBuilderDiagnostic(
  lifecycleContext: ExtensionLifecycleContext,
  extensionCode: string,
  numericCode: number,
  message: string,
  node: Node,
): ReturnType<typeof csharpProviderDiagnostic> {
  return {
    ...csharpProviderDiagnostic(
      csharpSourceSemanticsExtensionId,
      extensionCode,
      numericCode,
      message,
      [{ message: "C# attribute builder chain must be fully proven by finalized source-core facts before emission." }],
    ),
    nodeOrSpan: node,
    identity: `${extensionCode}:${lifecycleContext.compiler.ast.getFileName(lifecycleContext.compiler.ast.getSourceFile(node))}:${lifecycleContext.compiler.ast.pos(node)}:${lifecycleContext.compiler.ast.end(node)}`,
  };
}

function selectorApplicationTarget(
  lifecycleContext: ExtensionLifecycleContext,
  selectorCall: Node,
): ExtensionFactSubject | undefined {
  const argument = callArgument(lifecycleContext, selectorCall, 0);
  if (argument === undefined || !lifecycleContext.compiler.ast.is.IsArrowFunction(argument)) {
    return undefined;
  }
  const body = asNodeSubject(lifecycleContext.compiler.ast.body(argument));
  return body !== undefined && lifecycleContext.compiler.ast.is.IsPropertyAccessExpression(body)
    ? body
    : undefined;
}

function stringArgument(
  lifecycleContext: ExtensionLifecycleContext,
  call: Node,
  index: number,
): string | undefined {
  const argument = callArgument(lifecycleContext, call, index);
  if (argument === undefined) {
    return undefined;
  }
  if (lifecycleContext.compiler.ast.kindName(argument) === "KindStringLiteral") {
    return lifecycleContext.compiler.ast.text(argument);
  }
  const sourceFile = lifecycleContext.compiler.ast.getSourceFile(argument);
  const value = lifecycleContext.compiler.typeShape.getConstantValue(argument, { sourceFile });
  return typeof value === "string" ? value : undefined;
}

function callArgument(
  lifecycleContext: ExtensionLifecycleContext,
  call: Node,
  index: number,
): Node | undefined {
  return asNodeSubject(lifecycleContext.compiler.ast.arguments(call)[index]);
}

function selectedCallMemberId(
  call: Node,
  lifecycleContext: ExtensionLifecycleContext,
): string | undefined {
  const selected = lifecycleContext.host.facts.get(call, selectedTargetSignatureFactKey) ??
    lifecycleContext.host.factResolver.resolve(call, selectedTargetSignatureFactKey);
  return selected?.member.id;
}

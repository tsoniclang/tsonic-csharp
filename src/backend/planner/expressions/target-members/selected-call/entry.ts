import { selectedPolicyDiagnostic, targetPolicyDiagnostic, unsupportedNodeDiagnostic } from "../../../diagnostics.js";
import { translateCsharpJsValueArgumentFactory, translateCsharpJsValueInvocation, translateCsharpJsValueFactory } from "../../js-value-operations.js";
import { translateSelectedTargetCall } from "./target.js";
import { translateSourceOwnedCall } from "./source.js";
import type { CallArgumentPlanner, ExpressionPlanner } from "../../expression-planner-types.js";
import type { CsharpExpression } from "../../../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../../../context.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { ResolvedSourceCallInfo } from "../../../../../analysis/operations/index.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";

export function translateCsharpCallExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planCallArgument: CallArgumentPlanner,
): CsharpExpression | undefined {
  const expression = input.program.source.ast.as.AsCallExpression(node);
  const classification = input.program.operations.call(node);
  if (classification === undefined) {
    diagnostics.push(targetPolicyDiagnostic(
      node,
      "CSHARP_TARGET_CALL_CLASSIFICATION_MISSING",
      "C# planning received a call without a sealed target classification.",
    ));
    return undefined;
  }
  const sourceCall = classification.source;
  const sourceFlow = classification.sourceFlow;
  if (sourceFlow.kind === "keep-alive") {
    const value = planExpression(sourceFlow.valueExpression, sourceFile, input, diagnostics);
    return value === undefined ? undefined : {
      kind: "InvocationExpression",
      callee: { kind: "SimpleMemberAccessExpression", receiver: {
        kind: "AliasQualifiedName", alias: "global", name: {
          kind: "QualifiedName", left: { kind: "IdentifierName", name: "System" }, name: "GC",
        },
      }, name: "KeepAlive" },
      arguments: [{ kind: "Argument", expression: value }],
    };
  }
  if (sourceFlow.kind === "rejected") {
    diagnostics.push(targetPolicyDiagnostic(
      node,
      sourceFlow.code,
      sourceFlow.reason,
    ));
    return undefined;
  }
  const calleeNode = sourceCall?.sourceCallee.expression ??
    expression?.Expression;
  const jsValueShape = jsValueCallShape(input, sourceCall);
  const jsValueOperation = classification.jsValue;
  if (jsValueOperation.kind === "rejected") {
    diagnostics.push(unsupportedNodeDiagnostic(node, jsValueOperation.reason));
    return undefined;
  }
  if (jsValueOperation.kind === "resolved") {
    const sourceArguments = input.program.source.ast.arguments(node)
      .filter((argument): argument is Node => argument !== undefined);
    if (
      sourceArguments.length !== input.program.source.ast.arguments(node).length ||
      sourceArguments.some((argument) =>
        input.program.source.ast.is.IsSpreadElement(argument)
      )
    ) {
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        "JS-value calls require exact non-spread source arguments.",
      ));
      return undefined;
    }
    const receiverNode = jsValueShape.receiver ?? calleeNode;
    const receiver = receiverNode === undefined
      ? undefined
      : planExpression(receiverNode, sourceFile, input, diagnostics);
    const arguments_ = sourceArguments.map((argument) =>
      planExpression(argument, sourceFile, input, diagnostics)
    );
    if (
      receiver === undefined ||
      arguments_.some((argument) => argument === undefined)
    ) {
      return undefined;
    }
    const invocationArguments = jsValueCallArguments(
      input,
      jsValueShape,
      expression?.QuestionDotToken !== undefined,
      arguments_ as readonly CsharpExpression[],
      sourceFile,
      diagnostics,
      planExpression,
    );
    if (invocationArguments === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        "JS-value member calls require an exact selected property name or element key.",
      ));
      return undefined;
    }
    return translateCsharpJsValueInvocation(
      jsValueOperation,
      receiver,
      invocationArguments,
    );
  }
  const selection = classification.target;
  if (selection === undefined) {
    diagnostics.push(targetPolicyDiagnostic(
      node,
      "CSHARP_TARGET_CALL_CLASSIFICATION_INCOMPLETE",
      "The sealed C# call classification selected neither a JS-value operation nor a target call.",
    ));
    return undefined;
  }
  switch (selection.kind) {
    case "resolved":
      return translateSelectedTargetCall(
        node,
        selection.source,
        selection.call,
        sourceFile,
        input,
        diagnostics,
        planExpression,
        planCallArgument,
      );
    case "source-owned":
      return translateSourceOwnedCall(
        node,
        selection.source,
        classification,
        sourceFile,
        input,
        diagnostics,
        planExpression,
        planCallArgument,
      );
    case "rejected":
      diagnostics.push(selectedPolicyDiagnostic(
        node,
        selection.diagnostic,
      ));
      return undefined;
    case "missing":
      diagnostics.push(targetPolicyDiagnostic(
        node,
        "CSHARP_TARGET_CALL_NOT_CLOSED",
        selection.reason,
      ));
      return undefined;
    case "conflict":
      diagnostics.push(targetPolicyDiagnostic(
        node,
        "CSHARP_TARGET_CALL_IDENTITY_CONFLICT",
        selection.reason,
      ));
      return undefined;
    case "ambiguous":
      diagnostics.push(targetPolicyDiagnostic(
        node,
        "CSHARP_TARGET_CALL_AMBIGUOUS",
        selection.reason,
        selection.candidates.map((candidate) =>
          `candidate=${candidate}`),
      ));
      return undefined;
  }
}
type JsValueCallShape =
  | { readonly kind: "direct"; readonly receiver?: undefined }
  | {
      readonly kind: "property";
      readonly receiver: Node | undefined;
      readonly name: Node | undefined;
      readonly optionalReceiver: boolean;
    }
  | {
      readonly kind: "element";
      readonly receiver: Node | undefined;
      readonly key: Node | undefined;
      readonly optionalReceiver: boolean;
    };

function jsValueCallShape(
  input: CsharpPlanningContext,
  source: ResolvedSourceCallInfo | undefined,
): JsValueCallShape {
  const access = source?.sourceCalleeAccess;
  if (
    access?.kind === "property" &&
    input.program.source.ast.is.IsPropertyAccessExpression(access.expression)
  ) {
    const property = input.program.source.ast.as.AsPropertyAccessExpression(access.expression);
    return {
      kind: "property",
      receiver: access.receiver.expression,
      name: property?.name,
      optionalReceiver: property?.QuestionDotToken !== undefined,
    };
  }
  if (
    access?.kind === "element" &&
    input.program.source.ast.is.IsElementAccessExpression(access.expression)
  ) {
    const element = input.program.source.ast.as.AsElementAccessExpression(access.expression);
    return {
      kind: "element",
      receiver: access.receiver.expression,
      key: access.argument.expression,
      optionalReceiver: element?.QuestionDotToken !== undefined,
    };
  }
  return { kind: "direct" };
}

function jsValueCallArguments(
  input: CsharpPlanningContext,
  shape: JsValueCallShape,
  optionalCall: boolean,
  arguments_: readonly CsharpExpression[],
  sourceFile: SourceFile,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): readonly CsharpExpression[] | undefined {
  switch (shape.kind) {
    case "direct":
      return optionalCall
        ? [translateCsharpJsValueArgumentFactory(arguments_)]
        : arguments_;
    case "property":
      return shape.name === undefined
        ? undefined
        : [
            { kind: "LiteralExpression", value: input.program.source.ast.text(shape.name) },
            { kind: "LiteralExpression", value: shape.optionalReceiver },
            { kind: "LiteralExpression", value: optionalCall },
            translateCsharpJsValueArgumentFactory(arguments_),
          ];
    case "element": {
      const key = shape.key === undefined
        ? undefined
        : planExpression(
            shape.key,
            sourceFile,
            input,
            diagnostics,
          );
      return key === undefined
        ? undefined
        : [
            translateCsharpJsValueFactory(key),
            { kind: "LiteralExpression", value: shape.optionalReceiver },
            { kind: "LiteralExpression", value: optionalCall },
            translateCsharpJsValueArgumentFactory(arguments_),
          ];
    }
  }
}

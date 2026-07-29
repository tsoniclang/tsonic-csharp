import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import {
  selectCsharpTargetElement,
} from "../../policy/members/index.js";
import {
  selectCsharpCompatAnyReceiverOperation,
} from "../../policy/compat/index.js";
import type {
  CsharpTargetElementSelection,
} from "../../policy/members/index.js";
import {
  getCsharpReadOnlyIndexableCollectionElementTargetType,
  isCsharpDenseMutableCollectionTargetType,
  targetTypeRefEquals,
} from "../../policy/types/index.js";
import type {
  CsharpArgument,
  CsharpExpression,
} from "../../backend/roslyn/syntax.js";
import {
  selectedPolicyDiagnostic,
  targetPolicyDiagnostic,
  unsupportedNodeDiagnostic,
} from "../../backend/planner/diagnostics.js";
import type {
  CallArgumentPlanner,
  ExpressionPlanner,
} from "../../backend/planner/expression-planner-types.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../../backend/planner/target-types.js";
import type {
  CsharpTranslationContext,
} from "../context/index.js";
import {
  translateCsharpCompatInvocation,
} from "./compat.js";

export function translateCsharpElementAccess(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planCallArgument: CallArgumentPlanner,
): CsharpExpression | undefined {
  const expression = input.ast.as.AsElementAccessExpression(node);
  const receiverNode = expression?.Expression;
  const argumentNode = expression?.ArgumentExpression;
  const compat = selectCsharpCompatAnyReceiverOperation(
    input,
    receiverNode,
    sourceFile,
    "element-read",
    expression?.QuestionDotToken !== undefined,
  );
  if (compat.kind === "rejected") {
    diagnostics.push(unsupportedNodeDiagnostic(node, compat.reason));
    return undefined;
  }
  if (compat.kind === "resolved") {
    const receiver = receiverNode === undefined
      ? undefined
      : planExpression(receiverNode, sourceFile, input, diagnostics);
    const argument = argumentNode === undefined
      ? undefined
      : planExpression(argumentNode, sourceFile, input, diagnostics);
    if (receiver === undefined || argument === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        "C# compatibility element read requires an exact receiver and key.",
      ));
      return undefined;
    }
    return translateCsharpCompatInvocation(
      compat,
      receiver,
      [argument],
    );
  }
  const selection = selectCsharpTargetElement(input, node, sourceFile);
  switch (selection.kind) {
    case "resolved":
      return translateSelectedElement(
        node,
        selection,
        sourceFile,
        input,
        diagnostics,
        planExpression,
        planCallArgument,
      );
    case "source-owned":
      return translateSourceOwnedElement(
        node,
        selection,
        sourceFile,
        input,
        diagnostics,
        planExpression,
      );
    case "rejected":
      diagnostics.push(selectedPolicyDiagnostic(
        node,
        selection.diagnostic,
        sourceFile,
      ));
      return undefined;
    case "missing":
      diagnostics.push(targetPolicyDiagnostic(
        node,
        "CSHARP_TARGET_ELEMENT_NOT_CLOSED",
        selection.reason,
        sourceFile,
      ));
      return undefined;
    case "conflict":
      diagnostics.push(targetPolicyDiagnostic(
        node,
        "CSHARP_TARGET_ELEMENT_IDENTITY_CONFLICT",
        selection.reason,
        sourceFile,
      ));
      return undefined;
    case "ambiguous":
      diagnostics.push(targetPolicyDiagnostic(
        node,
        "CSHARP_TARGET_ELEMENT_AMBIGUOUS",
        selection.reason,
        sourceFile,
        selection.candidates.map((candidate) =>
          `candidate=${candidate}`),
      ));
      return undefined;
  }
}

function translateSelectedElement(
  node: Node,
  selection: Extract<
    CsharpTargetElementSelection,
    { readonly kind: "resolved" }
  >,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planCallArgument: CallArgumentPlanner,
): CsharpExpression | undefined {
  if (
    selection.receiver.kind !== "instance"
  ) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "Checked element access requires an exact instance C# target relation.",
    ));
    return undefined;
  }
  const parameter = selection.targetMember.parameters[
    selection.targetParameterIndex
  ];
  const expectedType = parameter === undefined
    ? undefined
    : csharpTypeFromTargetTypeRef(parameter.type);
  if (parameter === undefined || expectedType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "Selected C# indexer has no renderable related index parameter.",
    ));
    return undefined;
  }
  const receiver = planExpression(
    selection.source.receiver.expression,
    sourceFile,
    input,
    diagnostics,
  );
  const argument = planCallArgument(
    selection.source.argument.expression,
    sourceFile,
    input,
    diagnostics,
    expectedType,
    undefined,
    parameter.type,
    parameter.passingMode,
  );
  if (receiver === undefined || !isValueArgument(argument)) {
    if (argument !== undefined && argument.passing !== undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        "C# indexer arguments cannot use ref, in, or out passing.",
      ));
    }
    return undefined;
  }
  if (selection.invocation.kind === "method") {
    if (selection.source.accessMode !== "read") {
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        "A source element write cannot lower through a read-only target method relation.",
      ));
      return undefined;
    }
    const arguments_: CsharpArgument[] = [argument];
    if (selection.invocation.appendInt32Literal !== undefined) {
      arguments_.push({
        kind: "Argument",
        expression: {
          kind: "LiteralExpression",
          value: selection.invocation.appendInt32Literal,
        },
      });
    }
    return {
      kind: "InvocationExpression",
      callee: {
        kind: selection.source.optionalChain
          ? "ConditionalAccessExpression"
          : "SimpleMemberAccessExpression",
        receiver,
        name: selection.invocation.targetName,
      },
      arguments: arguments_,
    };
  }
  if (selection.targetMember.kind !== "indexer") {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "Checked element access selected indexer invocation without an exact C# indexer member.",
    ));
    return undefined;
  }
  return {
    kind: selection.source.optionalChain
      ? "ConditionalElementAccessExpression"
      : "ElementAccessExpression",
    receiver,
    argument: argument.expression,
  };
}

function translateSourceOwnedElement(
  node: Node,
  selection: Extract<
    CsharpTargetElementSelection,
    { readonly kind: "source-owned" }
  >,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  const receiverType = input.types.resolveType(
    selection.source.receiver.type,
    sourceFile,
  );
  if (
    receiverType?.kind === "tuple" &&
    selection.source.selectedElementIndex !== undefined
  ) {
    const receiver = planExpression(
      selection.source.receiver.expression,
      sourceFile,
      input,
      diagnostics,
    );
    return receiver === undefined
      ? undefined
      : {
          kind: "SimpleMemberAccessExpression",
          receiver,
          name: `Item${selection.source.selectedElementIndex + 1}`,
        };
  }
  const selectedResultType = input.types.resolveType(
    selection.source.sourceReadType ?? selection.source.sourceWriteType,
    sourceFile,
  );
  const elementType = getCsharpReadOnlyIndexableCollectionElementTargetType(
    receiverType,
  );
  if (
    elementType === undefined ||
    selectedResultType === undefined ||
    !targetTypeRefEquals(elementType, selectedResultType) ||
    (
      selection.source.accessMode !== "read" &&
      !isCsharpDenseMutableCollectionTargetType(receiverType) &&
      receiverType?.kind !== "array"
    )
  ) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "The exact selected source element access has no matching C# indexable target representation.",
    ));
    return undefined;
  }
  const receiver = planExpression(
    selection.source.receiver.expression,
    sourceFile,
    input,
    diagnostics,
  );
  const argument = planExpression(
    selection.source.argument.expression,
    sourceFile,
    input,
    diagnostics,
  );
  return receiver === undefined || argument === undefined
    ? undefined
    : {
        kind: selection.source.optionalChain
          ? "ConditionalElementAccessExpression"
          : "ElementAccessExpression",
        receiver,
        argument,
      };
}

function isValueArgument(
  argument: CsharpArgument | undefined,
): argument is CsharpArgument & { readonly passing?: undefined } {
  return argument !== undefined && argument.passing === undefined;
}

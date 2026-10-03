import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpTargetElementSelection,
} from "../../../../analysis/operations/index.js";
import {
  csharpNullableTargetType,
  getCsharpNullableElementTargetType,
  getCsharpReadOnlyIndexableCollectionElementTargetType,
  isCsharpDenseMutableCollectionTargetType,
  targetTypeRefEquals,
} from "../../../../target-model/types/index.js";
import type {
  CsharpArgument,
  CsharpExpression,
} from "../../../target-ast/roslyn/index.js";
import {
  selectedPolicyDiagnostic,
  targetPolicyDiagnostic,
  unsupportedNodeDiagnostic,
} from "../../diagnostics.js";
import type {
  CallArgumentPlanner,
  ExpressionPlanner,
} from "../expression-planner-types.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../../types/target-types.js";
import type {
  CsharpPlanningContext,
} from "../../context.js";
import {
  translateCsharpJsValueInvocation,
} from "../js-value-operations.js";
import {
  applyCsharpConversionSelection,
} from "../conversions.js";
import {
  translateCsharpSelectedReceiver,
} from "../receivers.js";
import { csharpRecordOptionalRead } from "../../objects/indexed-records.js";
import type { CsharpPlannedArgument, CsharpPlannedValue } from "../planned-values.js";
import { buildCsharpPlannedValue, planCsharpOptionalReceiverValue, projectCsharpPlannedValue } from "../planned-value-composition.js";
import { selectCsharpCollectionElementRead } from "../../../../target-model/types/collection-reads.js";
import { planCsharpCollectionElementRead } from "../collection-reads.js";

export function translateCsharpElementAccess(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planCallArgument: CallArgumentPlanner,
): CsharpPlannedValue | undefined {
  const expression = input.program.source.ast.as.AsElementAccessExpression(node);
  const receiverNode = expression?.Expression;
  const argumentNode = expression?.ArgumentExpression;
  const classification = input.program.operations.element(node);
  if (classification === undefined) {
    diagnostics.push(targetPolicyDiagnostic(
      node,
      "CSHARP_TARGET_ELEMENT_CLASSIFICATION_MISSING",
      "C# planning received an element access without a sealed target classification.",
    ));
    return undefined;
  }
  const jsValueOperation = classification.jsValue;
  if (jsValueOperation.kind === "rejected") {
    diagnostics.push(unsupportedNodeDiagnostic(node, jsValueOperation.reason));
    return undefined;
  }
  if (jsValueOperation.kind === "resolved") {
    const receiver = receiverNode === undefined
      ? undefined
      : planExpression(receiverNode, sourceFile, input, diagnostics);
    const argument = argumentNode === undefined
      ? undefined
      : planExpression(argumentNode, sourceFile, input, diagnostics);
    if (receiver === undefined || argument === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        "A JS-value element read requires an exact receiver and key.",
      ));
      return undefined;
    }
    const optional = expression?.QuestionDotToken !== undefined;
    const operation = optional ? jsValueOperation.presentOperation : jsValueOperation;
    if (operation === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(node, "An optional closed element read requires its exact selected present invocation."));
      return undefined;
    }
    return planElementOperands(node, sourceFile, input, diagnostics, receiver, argument,
      optional,
      (target, key) => translateCsharpJsValueInvocation(input.scope.typeParameterNames, operation, target, [key]));
  }
  const selection = classification.target;
  if (selection === undefined) {
    diagnostics.push(targetPolicyDiagnostic(
      node,
      "CSHARP_TARGET_ELEMENT_CLASSIFICATION_INCOMPLETE",
      "The sealed C# element classification selected neither a JS-value operation nor a target element.",
    ));
    return undefined;
  }
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
        classification,
        sourceFile,
        input,
        diagnostics,
        planExpression,
      );
    case "project-indexer":
      return translateProjectIndexerElement(
        node,
        selection,
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
        "CSHARP_TARGET_ELEMENT_NOT_CLOSED",
        selection.reason,
      ));
      return undefined;
    case "conflict":
      diagnostics.push(targetPolicyDiagnostic(
        node,
        "CSHARP_TARGET_ELEMENT_IDENTITY_CONFLICT",
        selection.reason,
      ));
      return undefined;
    case "ambiguous":
      diagnostics.push(targetPolicyDiagnostic(
        node,
        "CSHARP_TARGET_ELEMENT_AMBIGUOUS",
        selection.reason,
        selection.candidates.map((candidate) =>
          `candidate=${candidate}`),
      ));
      return undefined;
  }
}

function translateProjectIndexerElement(
  node: Node,
  selection: Extract<
    CsharpTargetElementSelection,
    { readonly kind: "project-indexer" }
  >,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planCallArgument: CallArgumentPlanner,
): CsharpPlannedValue | undefined {
  const keyType = csharpTypeFromTargetTypeRef(selection.keyType, input.scope.typeParameterNames);
  if (keyType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "The exact selected project index key has no renderable C# target type.",
    ));
    return undefined;
  }
  const receiver = translateCsharpSelectedReceiver(
    selection.source.receiver,
    sourceFile,
    input,
    diagnostics,
    planExpression,
    input.program.operations.element(node)?.receiverProjection,
  );
  const argument = planCallArgument(
    selection.source.argument.expression,
    sourceFile,
    input,
    diagnostics,
    keyType,
    undefined,
    selection.keyType,
    "by-value",
  );
  if (receiver === undefined || !isValueArgument(argument)) {
    return undefined;
  }
  const planned = planElementOperands(node, sourceFile, input, diagnostics, receiver, argument,
    selection.source.optionalChain,
    (target, key) => ({ kind: "ElementAccessExpression", receiver: target, arguments: [key] }),
    selection.valueType);
  if (
    selection.source.accessMode !== "read" ||
    selection.selectedReadType === undefined
  ) {
    return planned;
  }
  return projectCsharpPlannedValue(node, sourceFile, input, diagnostics, planned, value => applyCsharpConversionSelection(
    node,
    sourceFile,
    input,
    diagnostics,
    selection.valueType,
    selection.selectedReadType,
    input.program.operations.element(node)?.flowReadConversion ?? {
      kind: "rejected",
      reason: "The sealed C# element-read classification has no conversion.",
    },
    value,
  ), selection.selectedReadType);
}

function translateSelectedElement(
  node: Node,
  selection: Extract<
    CsharpTargetElementSelection,
    { readonly kind: "resolved" }
  >,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planCallArgument: CallArgumentPlanner,
): CsharpPlannedValue | undefined {
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
    : csharpTypeFromTargetTypeRef(parameter.type, input.scope.typeParameterNames);
  if (parameter === undefined || expectedType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "Selected C# indexer has no renderable related index parameter.",
    ));
    return undefined;
  }
  const receiver = translateCsharpSelectedReceiver(
    selection.source.receiver,
    sourceFile,
    input,
    diagnostics,
    planExpression,
    input.program.operations.element(node)?.receiverProjection,
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
  if (selection.invocation.kind === "record-optional-read") {
    if (selection.source.accessMode !== "read") return undefined;
    return planElementOperands(node, sourceFile, input, diagnostics, receiver, argument, selection.source.optionalChain,
      (target, key) => csharpRecordOptionalRead(target, key, false,
      selection.targetMember.declaringType, selection.targetMember.returnType,
      `__tsonic_record_${input.program.source.ast.pos(node)}_${input.program.source.ast.end(node)}`, input));
  }
  if (selection.invocation.kind === "array-like") {
    const projection = selection.invocation.projection;
    const owner = selection.targetMember.declaringType === undefined ? undefined
      : csharpTypeFromTargetTypeRef(selection.targetMember.declaringType, input.scope.typeParameterNames);
    if (owner === undefined) return undefined;
    return planElementOperands(node, sourceFile, input, diagnostics, receiver, argument, selection.source.optionalChain,
      (target, key) => {
      const projected = applyCsharpConversionSelection(node, sourceFile, input, diagnostics,
        projection.source, projection.target, projection.conversion, target);
      return projected === undefined ? undefined : {
      kind: "InvocationExpression",
      callee: { kind: "SimpleMemberAccessExpression", receiver: owner, name: selection.targetMember.targetName },
      arguments: [{ kind: "Argument", expression: projected }, { kind: "Argument", expression: key }],
      };
    });
  }
  if (selection.invocation.kind === "method") {
    const invocation = selection.invocation;
    if (selection.source.accessMode !== "read") {
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        "A source element write cannot lower through a read-only target method relation.",
      ));
      return undefined;
    }
    return planElementOperands(node, sourceFile, input, diagnostics, receiver, argument, selection.source.optionalChain,
      (target, key) => {
    const arguments_: CsharpArgument[] = [{ kind: "Argument", expression: key }];
    if (invocation.appendInt32Literal !== undefined) {
      arguments_.push({
        kind: "Argument",
        expression: {
          kind: "LiteralExpression",
          value: invocation.appendInt32Literal,
        },
      });
    }
    return {
      kind: "InvocationExpression",
      callee: {
        kind: "SimpleMemberAccessExpression",
        receiver: target,
        name: invocation.targetName,
      },
      arguments: arguments_,
    };
    });
  }
  if (selection.targetMember.kind !== "indexer") {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "Checked element access selected indexer invocation without an exact C# indexer member.",
    ));
    return undefined;
  }
  return planElementOperands(node, sourceFile, input, diagnostics, receiver, argument, selection.source.optionalChain,
    (target, key) => ({ kind: "ElementAccessExpression", receiver: target, arguments: [key] }));
}

function translateSourceOwnedElement(
  node: Node,
  selection: Extract<
    CsharpTargetElementSelection,
    { readonly kind: "source-owned" }
  >,
  classification: NonNullable<ReturnType<CsharpPlanningContext["program"]["operations"]["element"]>>,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpPlannedValue | undefined {
  const receiverType = classification.receiverType;
  const indexableReceiverType =
    getCsharpNullableElementTargetType(receiverType) ?? receiverType;
  if (
    indexableReceiverType?.kind === "tuple" &&
    selection.source.selectedElementIndex !== undefined
  ) {
    const elementIndex = selection.source.selectedElementIndex;
    const receiver = translateCsharpSelectedReceiver(
      selection.source.receiver,
      sourceFile,
      input,
      diagnostics,
      planExpression,
      input.program.operations.element(node)?.receiverProjection,
    );
    return receiver === undefined
      ? undefined
      : projectCsharpPlannedValue(node, sourceFile, input, diagnostics, receiver, value => ({
          kind: selection.source.optionalChain
            ? "ConditionalAccessExpression"
            : "SimpleMemberAccessExpression",
          receiver: value,
          name: `Item${elementIndex + 1}`,
        }));
  }
  const selectedResultType = classification.selectedResultType;
  const elementType = getCsharpReadOnlyIndexableCollectionElementTargetType(
    indexableReceiverType,
  );
  const expectedResultType = elementType === undefined
    ? undefined
    : selection.source.optionalChain
      ? csharpNullableTargetType(elementType)
      : elementType;
  if (
    elementType === undefined ||
    selectedResultType === undefined ||
    expectedResultType === undefined ||
    !targetTypeRefEquals(expectedResultType, selectedResultType) ||
    (
      selection.source.accessMode !== "read" &&
      !isCsharpDenseMutableCollectionTargetType(indexableReceiverType) &&
      indexableReceiverType?.kind !== "array"
    )
  ) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "The exact selected source element access has no matching C# indexable target representation.",
    ));
    return undefined;
  }
  const receiver = translateCsharpSelectedReceiver(
    selection.source.receiver,
    sourceFile,
    input,
    diagnostics,
    planExpression,
    input.program.operations.element(node)?.receiverProjection,
  );
  const argument = planExpression(
    selection.source.argument.expression,
    sourceFile,
    input,
    diagnostics,
  );
  const read = indexableReceiverType === undefined ? undefined : selectCsharpCollectionElementRead(indexableReceiverType);
  if (read?.kind === "invalid") {
    diagnostics.push(unsupportedNodeDiagnostic(node, read.reason));
    return undefined;
  }
  if (read?.kind === "method" && selection.source.accessMode === "read" && indexableReceiverType !== undefined) {
    const carrier = indexableReceiverType;
    return planElementOperands(node, sourceFile, input, diagnostics, receiver, argument, selection.source.optionalChain,
      (target, key) => planCsharpCollectionElementRead(carrier, target, key, input.scope.typeParameterNames), selectedResultType);
  }
  return planElementOperands(node, sourceFile, input, diagnostics, receiver, argument, selection.source.optionalChain,
    (target, key) => ({ kind: "ElementAccessExpression", receiver: target, arguments: [key] }), selectedResultType);
}

function isValueArgument(
  argument: CsharpPlannedArgument | undefined,
): argument is CsharpPlannedArgument & { readonly passing?: undefined } {
  return argument !== undefined && argument.passing === undefined;
}

function planElementOperands(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  receiver: CsharpPlannedValue | undefined,
  argument: CsharpPlannedValue | undefined,
  optional: boolean,
  build: (receiver: CsharpExpression, argument: CsharpExpression) => CsharpExpression | undefined,
  carrier = input.types.classifications.resolveNode(node, sourceFile),
): CsharpPlannedValue | undefined {
  return optional ? planCsharpOptionalReceiverValue(node, sourceFile, input, diagnostics, receiver, present =>
    buildCsharpPlannedValue(node, sourceFile, input, diagnostics, [argument], values => build(present, values[0]!), carrier), carrier)
    : buildCsharpPlannedValue(node, sourceFile, input, diagnostics, [receiver, argument],
      values => build(values[0]!, values[1]!), carrier);
}

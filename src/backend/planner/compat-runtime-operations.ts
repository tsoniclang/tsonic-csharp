import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpArgument, CsharpExpression } from "../roslyn/syntax.js";
import type {
  CsharpTargetMemberOperationFact,
  CsharpTargetOperationArgument,
} from "../../source/csharp-facts.js";
import {
  csharpTargetOperationFactKey,
} from "../../source/csharp-facts.js";
import {
  isCsharpAnyRuntimeCarrier,
  isCsharpClosedCompatRuntimeCarrier,
} from "../../source/csharp-source-semantics/target-types.js";
import {
  readCsharpTypescriptCompatibilityMode,
} from "../../options/csharp-target-options.js";
import {
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";
import {
  requireCsharpIdentifier,
} from "./identifiers.js";
import {
  getRuntimeCarrierForExpression,
} from "./runtime-carriers.js";
import {
  csharpStaticMemberExpression,
} from "./csharp-target-operations.js";
import type {
  ExpressionPlanner,
} from "./expression-planner-types.js";

export function tryPlanCompatRuntimePropertyGet(
  operationNode: Node,
  receiverNode: Node | undefined,
  optional: boolean,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  if (!isOpaqueAnyReceiver(receiverNode, sourceFile, input)) {
    return undefined;
  }
  return planCompatRuntimeReceiverOperation(operationNode, receiverNode, optional, [], "C# compat-runtime any property get", sourceFile, input, diagnostics, planExpression);
}

export function tryPlanCompatRuntimePropertySet(
  operationNode: Node,
  receiverNode: Node | undefined,
  rightNode: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  if (!isOpaqueAnyReceiver(receiverNode, sourceFile, input)) {
    return undefined;
  }
  const operation = getRequiredCompatRuntimeMemberOperation(operationNode, "C# compat-runtime any property set", input, diagnostics);
  if (operation === undefined || receiverNode === undefined) {
    return undefined;
  }
  if (operation.operationKind !== "method") {
    diagnostics.push(unsupportedNodeDiagnostic(operationNode, `C# compat-runtime any property set requires a finalized method operation fact with explicit argument projection, but provider recorded '${operation.operationKind}'.`));
    return undefined;
  }
  const receiver = planExpression(receiverNode, sourceFile, input, diagnostics);
  return receiver === undefined
    ? undefined
    : planCompatRuntimeMethodInvocation(operationNode, operation, receiver, [rightNode], false, "C# compat-runtime any property set", sourceFile, input, diagnostics, planExpression);
}

export function tryPlanCompatRuntimeElementGet(
  operationNode: Node,
  receiverNode: Node | undefined,
  argumentNode: Node | undefined,
  optional: boolean,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  if (!isOpaqueAnyReceiver(receiverNode, sourceFile, input)) {
    return undefined;
  }
  return planCompatRuntimeReceiverOperation(operationNode, receiverNode, optional, [argumentNode], "C# compat-runtime any element get", sourceFile, input, diagnostics, planExpression);
}

export function tryPlanCompatRuntimeElementSet(
  operationNode: Node,
  receiverNode: Node | undefined,
  argumentNode: Node | undefined,
  rightNode: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  if (!isOpaqueAnyReceiver(receiverNode, sourceFile, input)) {
    return undefined;
  }
  const operation = getRequiredCompatRuntimeMemberOperation(operationNode, "C# compat-runtime any element set", input, diagnostics);
  if (operation === undefined || receiverNode === undefined) {
    return undefined;
  }
  if (operation.operationKind !== "method") {
    diagnostics.push(unsupportedNodeDiagnostic(operationNode, `C# compat-runtime any element set requires a finalized method operation fact, but provider recorded '${operation.operationKind}'.`));
    return undefined;
  }
  const receiver = planExpression(receiverNode, sourceFile, input, diagnostics);
  return receiver === undefined
    ? undefined
    : planCompatRuntimeMethodInvocation(operationNode, operation, receiver, [argumentNode, rightNode], false, "C# compat-runtime any element set", sourceFile, input, diagnostics, planExpression);
}

export function tryPlanCompatRuntimeCall(
  operationNode: Node,
  calleeNode: Node | undefined,
  argumentNodes: readonly (Node | undefined)[],
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  if (!isCompatRuntimeCallableReceiver(calleeNode, sourceFile, input)) {
    return undefined;
  }
  return planCompatRuntimeReceiverOperation(operationNode, calleeNode, false, argumentNodes, "C# compat-runtime any call", sourceFile, input, diagnostics, planExpression);
}

export function tryPlanCompatRuntimeConstruct(
  operationNode: Node,
  calleeNode: Node | undefined,
  argumentNodes: readonly (Node | undefined)[],
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  if (!isCompatRuntimeCallableReceiver(calleeNode, sourceFile, input)) {
    return undefined;
  }
  return planCompatRuntimeReceiverOperation(operationNode, calleeNode, false, argumentNodes, "C# compat-runtime any construct", sourceFile, input, diagnostics, planExpression);
}

export function tryPlanCompatRuntimeOperator(
  operationNode: Node,
  leftNode: Node | undefined,
  rightNode: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  if (!hasClosedCompatRuntimeMemberOperation(operationNode, input)) {
    return undefined;
  }
  return planCompatRuntimeStaticOperation(operationNode, [leftNode, rightNode], "C# compat-runtime any operator", sourceFile, input, diagnostics, planExpression);
}

export function tryPlanCompatRuntimeUnaryOperator(
  operationNode: Node,
  operandNode: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  if (!hasClosedCompatRuntimeMemberOperation(operationNode, input)) {
    return undefined;
  }
  return planCompatRuntimeStaticOperation(operationNode, [operandNode], "C# compat-runtime any unary operator", sourceFile, input, diagnostics, planExpression);
}

function hasClosedCompatRuntimeMemberOperation(
  operationNode: Node,
  input: TargetCompileInput,
): boolean {
  const operation = input.facts.getFact(operationNode, csharpTargetOperationFactKey);
  return operation?.kind === "member" && isClosedCompatRuntimeOperation(operation);
}

function planCompatRuntimeStaticOperation(
  operationNode: Node,
  argumentNodes: readonly (Node | undefined)[],
  purpose: string,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  const operation = getRequiredCompatRuntimeMemberOperation(operationNode, purpose, input, diagnostics, { allowStatic: true });
  if (operation === undefined) {
    return undefined;
  }
  if (operation.operationKind !== "method") {
    diagnostics.push(unsupportedNodeDiagnostic(operationNode, `${purpose} requires a finalized static method operation fact, but provider recorded '${operation.operationKind}'.`));
    return undefined;
  }
  if (operation.static !== true) {
    diagnostics.push(unsupportedNodeDiagnostic(operationNode, `${purpose} requires a finalized static runtime helper operation fact; backend emission must not invent target dispatch from source syntax.`));
    return undefined;
  }
  const callee = csharpStaticMemberExpression(operation, diagnostics, operationNode, purpose);
  if (callee === undefined) {
    return undefined;
  }
  const arguments_ = planCompatRuntimeArguments(operationNode, operation.argumentProjection, argumentNodes, purpose, sourceFile, input, diagnostics, planExpression);
  if (arguments_ === undefined) {
    return undefined;
  }
  return {
    kind: "InvocationExpression",
    callee,
    arguments: arguments_,
  };
}

function planCompatRuntimeReceiverOperation(
  operationNode: Node,
  receiverNode: Node | undefined,
  optional: boolean,
  argumentNodes: readonly (Node | undefined)[],
  purpose: string,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  const operation = getRequiredCompatRuntimeMemberOperation(operationNode, purpose, input, diagnostics);
  if (operation === undefined || receiverNode === undefined) {
    return undefined;
  }
  const receiver = planExpression(receiverNode, sourceFile, input, diagnostics);
  if (receiver === undefined) {
    return undefined;
  }
  if (operation.operationKind === "property" && argumentNodes.length === 0) {
    return {
      kind: optional ? "ConditionalAccessExpression" : "SimpleMemberAccessExpression",
      receiver,
      name: requireCsharpIdentifier(operation.memberName, diagnostics, `${purpose} property member`),
    };
  }
  if (operation.operationKind !== "method") {
    diagnostics.push(unsupportedNodeDiagnostic(operationNode, `${purpose} requires a finalized method operation fact, but provider recorded '${operation.operationKind}'.`));
    return undefined;
  }
  return planCompatRuntimeMethodInvocation(operationNode, operation, receiver, argumentNodes, optional, purpose, sourceFile, input, diagnostics, planExpression);
}

function planCompatRuntimeMethodInvocation(
  operationNode: Node,
  operation: CsharpTargetMemberOperationFact,
  receiver: CsharpExpression,
  argumentNodes: readonly (Node | undefined)[],
  optional: boolean,
  purpose: string,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  const arguments_ = planCompatRuntimeArguments(operationNode, operation.argumentProjection, argumentNodes, purpose, sourceFile, input, diagnostics, planExpression);
  if (arguments_ === undefined) {
    return undefined;
  }
  return {
    kind: "InvocationExpression",
    callee: {
      kind: optional ? "ConditionalAccessExpression" : "SimpleMemberAccessExpression",
      receiver,
      name: requireCsharpIdentifier(operation.memberName, diagnostics, `${purpose} method member`),
    },
    arguments: arguments_,
  };
}

function planCompatRuntimeArguments(
  operationNode: Node,
  projection: readonly CsharpTargetOperationArgument[] | undefined,
  argumentNodes: readonly (Node | undefined)[],
  purpose: string,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): readonly CsharpArgument[] | undefined {
  if (projection === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(operationNode, `${purpose} requires an explicit finalized argument projection; backend emission must not infer compat-runtime carrier arguments from source syntax.`));
    return undefined;
  }
  const arguments_: CsharpArgument[] = [];
  for (const argument of projection) {
    const expression = planCompatRuntimeArgument(operationNode, argument, argumentNodes, purpose, sourceFile, input, diagnostics, planExpression);
    if (expression === undefined) {
      return undefined;
    }
    arguments_.push({ kind: "Argument", expression });
  }
  return arguments_;
}

function planCompatRuntimeArgument(
  operationNode: Node,
  argument: CsharpTargetOperationArgument,
  argumentNodes: readonly (Node | undefined)[],
  purpose: string,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  switch (argument.kind) {
    case "literal":
      return { kind: "LiteralExpression", value: argument.value };
    case "source-argument": {
      const sourceArgument = argumentNodes[argument.index];
      if (sourceArgument === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(operationNode, `${purpose} argument projection requires source argument index ${argument.index}, but the source operation does not provide it.`));
        return undefined;
      }
      return planExpression(sourceArgument, sourceFile, input, diagnostics);
    }
  }
}

function getRequiredCompatRuntimeMemberOperation(
  operationNode: Node,
  purpose: string,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  options: { readonly allowStatic?: boolean } = {},
): CsharpTargetMemberOperationFact | undefined {
  if (readCsharpTypescriptCompatibilityMode(input.target) !== "compat") {
    diagnostics.push(unsupportedNodeDiagnostic(operationNode, `${purpose} is only valid when the C# target selects typescriptCompatibility: "compat".`));
    return undefined;
  }
  const operation = input.facts.getFact(operationNode, csharpTargetOperationFactKey);
  if (operation === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(operationNode, `${purpose} requires a finalized closed compat-runtime operation fact before C# emission.`));
    return undefined;
  }
  if (operation.kind !== "member") {
    diagnostics.push(unsupportedNodeDiagnostic(operationNode, `${purpose} requires a finalized member operation fact, but provider recorded '${operation.kind}'.`));
    return undefined;
  }
  if (!isClosedCompatRuntimeOperation(operation)) {
    diagnostics.push(unsupportedNodeDiagnostic(operationNode, `${purpose} requires a closed TsValue/TsObject/TsArray/TsFunction carrier in the finalized C# operation fact.`));
    return undefined;
  }
  if (operation.static === true && options.allowStatic !== true) {
    diagnostics.push(unsupportedNodeDiagnostic(operationNode, `${purpose} must be an instance operation on the finalized runtime carrier; static target dispatch would bypass the proven any carrier.`));
    return undefined;
  }
  return operation;
}

function isClosedCompatRuntimeOperation(operation: CsharpTargetMemberOperationFact): boolean {
  return isCsharpClosedCompatRuntimeCarrier(operation.declaringType);
}

function isOpaqueAnyReceiver(
  receiverNode: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): boolean {
  return isCsharpAnyRuntimeCarrier(getRuntimeCarrierForExpression(input, receiverNode, sourceFile));
}

function isCompatRuntimeCallableReceiver(
  receiverNode: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): boolean {
  const carrier = getRuntimeCarrierForExpression(input, receiverNode, sourceFile);
  return isCsharpAnyRuntimeCarrier(carrier) || isCsharpClosedCompatRuntimeCarrier(carrier);
}

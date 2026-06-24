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
  invalidExpression,
} from "./invalid-expression.js";
import {
  requireCsharpIdentifier,
} from "./identifiers.js";
import {
  getRuntimeCarrierForExpression,
} from "./runtime-carriers.js";
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
    return invalidExpression("compat any property set operation");
  }
  if (operation.operationKind === "property") {
    return {
      kind: "AssignmentExpression",
      left: {
        kind: "SimpleMemberAccessExpression",
        receiver: planExpression(receiverNode, sourceFile, input, diagnostics),
        name: requireCsharpIdentifier(operation.memberName, diagnostics, "C# compat-runtime property setter member"),
      },
      operatorToken: { kind: "EqualsToken" },
      right: rightNode === undefined
        ? invalidExpression("compat any property set value")
        : planExpression(rightNode, sourceFile, input, diagnostics),
    };
  }
  if (operation.operationKind !== "method") {
    diagnostics.push(unsupportedNodeDiagnostic(operationNode, `C# compat-runtime any property set requires a finalized method or property operation fact, but provider recorded '${operation.operationKind}'.`));
    return invalidExpression("compat any property set kind");
  }
  return planCompatRuntimeMethodInvocation(operationNode, operation, receiverNode, [rightNode], false, "C# compat-runtime any property set", sourceFile, input, diagnostics, planExpression);
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
  if (!isOpaqueAnyReceiver(calleeNode, sourceFile, input)) {
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
  if (!isOpaqueAnyReceiver(calleeNode, sourceFile, input)) {
    return undefined;
  }
  return planCompatRuntimeReceiverOperation(operationNode, calleeNode, false, argumentNodes, "C# compat-runtime any construct", sourceFile, input, diagnostics, planExpression);
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
): CsharpExpression {
  const operation = getRequiredCompatRuntimeMemberOperation(operationNode, purpose, input, diagnostics);
  if (operation === undefined || receiverNode === undefined) {
    return invalidExpression("compat any operation");
  }
  if (operation.operationKind === "property" && argumentNodes.length === 0) {
    return {
      kind: optional ? "ConditionalAccessExpression" : "SimpleMemberAccessExpression",
      receiver: planExpression(receiverNode, sourceFile, input, diagnostics),
      name: requireCsharpIdentifier(operation.memberName, diagnostics, `${purpose} property member`),
    };
  }
  if (operation.operationKind !== "method") {
    diagnostics.push(unsupportedNodeDiagnostic(operationNode, `${purpose} requires a finalized method operation fact, but provider recorded '${operation.operationKind}'.`));
    return invalidExpression("compat any operation kind");
  }
  return planCompatRuntimeMethodInvocation(operationNode, operation, receiverNode, argumentNodes, optional, purpose, sourceFile, input, diagnostics, planExpression);
}

function planCompatRuntimeMethodInvocation(
  operationNode: Node,
  operation: CsharpTargetMemberOperationFact,
  receiverNode: Node,
  argumentNodes: readonly (Node | undefined)[],
  optional: boolean,
  purpose: string,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression {
  const arguments_ = planCompatRuntimeArguments(operationNode, operation.argumentProjection, argumentNodes, purpose, sourceFile, input, diagnostics, planExpression);
  if (arguments_ === undefined) {
    return invalidExpression("compat any operation arguments");
  }
  return {
    kind: "InvocationExpression",
    callee: {
      kind: optional ? "ConditionalAccessExpression" : "SimpleMemberAccessExpression",
      receiver: planExpression(receiverNode, sourceFile, input, diagnostics),
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
  if (operation.static === true) {
    diagnostics.push(unsupportedNodeDiagnostic(operationNode, `${purpose} must be an instance operation on the finalized runtime carrier; static target dispatch would bypass the proven any carrier.`));
    return undefined;
  }
  return operation;
}

function isClosedCompatRuntimeOperation(operation: CsharpTargetMemberOperationFact): boolean {
  return isCsharpClosedCompatRuntimeCarrier(operation.declaringType) ||
    isCsharpClosedCompatRuntimeCarrier(operation.resultType);
}

function isOpaqueAnyReceiver(
  receiverNode: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): boolean {
  return isCsharpAnyRuntimeCarrier(getRuntimeCarrierForExpression(input, receiverNode, sourceFile));
}

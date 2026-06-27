import {
  AsCallExpression,
} from "../source-ast.js";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  TargetCompileInput,
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpExpression,
} from "../../roslyn/syntax.js";
import {
  getCallableSemanticOwnership,
  pushMissingTargetFactDiagnostic,
} from "../semantic-guards.js";
import type {
  CallArgumentPlanner,
  ExpressionPlanner,
} from "../expression-planner-types.js";
import {
  planSelectedTargetCallee,
  planSelectedTargetCallArguments,
} from "../expression-selected-target-members.js";
import {
  getRequiredCsharpTargetMemberOperationForSelectedSignature,
  getRequiredCsharpTargetOperationForSelectedSignature,
} from "../csharp-target-operations.js";
import {
  tryPlanCompatRuntimeCall,
} from "../compat-runtime-operations.js";
import {
  planNativeArrayCreationCall,
} from "./native-array-call.js";
import {
  planSourceOwnedCallArguments,
  planSourceOwnedCallCallee,
} from "./source-owned-call.js";

export function planCallExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planCallArgument: CallArgumentPlanner,
): CsharpExpression | undefined {
  const expression = AsCallExpression(node)!;
  const compatDiagnosticsStart = diagnostics.length;
  const compatRuntimeCall = tryPlanCompatRuntimeCall(node, expression.Expression, expression.Arguments?.Nodes ?? [], sourceFile, input, diagnostics, planExpression);
  if (compatRuntimeCall !== undefined) {
    return compatRuntimeCall;
  }
  if (diagnostics.length > compatDiagnosticsStart) {
    return undefined;
  }
  const ownership = getCallableSemanticOwnership(expression.Expression, sourceFile, input);
  const selectedTargetCall = input.facts.getSelectedTargetCall(node);
  if (selectedTargetCall !== undefined) {
    const targetOperation = getRequiredCsharpTargetOperationForSelectedSignature(input, node, selectedTargetCall, diagnostics, "C# call emission");
    if (targetOperation?.kind === "array-creation") {
      return planNativeArrayCreationCall(node, expression, targetOperation, selectedTargetCall, sourceFile, input, diagnostics, planCallArgument);
    }
    const csharpOperation = getRequiredCsharpTargetMemberOperationForSelectedSignature(input, node, selectedTargetCall, diagnostics, "C# call emission");
    if (csharpOperation === undefined) {
      return undefined;
    }
    const member = csharpOperation.selectedMember;
    if (member === undefined) {
      return undefined;
    }
    const callee = planSelectedTargetCallee(expression.Expression, csharpOperation, sourceFile, input, diagnostics, planExpression);
    const arguments_ = planSelectedTargetCallArguments(expression.Expression, expression, member, csharpOperation.argumentArrayLiteralElementTypes, sourceFile, input, diagnostics, planCallArgument);
    if (callee === undefined || arguments_ === undefined) {
      return undefined;
    }
    return {
      kind: "InvocationExpression",
      callee,
      arguments: arguments_,
    };
  }
  if (ownership.requiresTargetFact || !ownership.sourceOwned) {
    pushMissingTargetFactDiagnostic(diagnostics, node, "C# call emission requires a source-owned callable or a selected target signature fact.", ownership);
    return undefined;
  }
  const callee = planSourceOwnedCallCallee(node, expression.Expression!, sourceFile, input, diagnostics, planExpression);
  const arguments_ = planSourceOwnedCallArguments(node, expression.Arguments?.Nodes ?? [], sourceFile, input, diagnostics, planCallArgument);
  if (callee === undefined || arguments_ === undefined) {
    return undefined;
  }
  return {
    kind: "InvocationExpression",
    callee,
    arguments: arguments_,
  };
}

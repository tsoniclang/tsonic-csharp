import {
  AsElementAccessExpression,
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
  CsharpArgument,
  CsharpExpression,
} from "../../roslyn/syntax.js";
import {
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";
import {
  ensureElementAccessCanBeRendered,
} from "../expression-element-access-rules.js";
import type {
  ExpressionPlanner,
} from "../expression-planner-types.js";
import {
  planSelectedTargetReceiverExpression,
} from "../expression-selected-target-members.js";
import type {
  CsharpTargetMemberOperationFact,
  CsharpTargetOperationArgument,
} from "../../../source/csharp-facts.js";
import {
  getRequiredCsharpTargetOperation,
} from "../csharp-target-operations.js";
import {
  getRuntimeCarrierForExpression,
} from "../runtime-carriers.js";
import {
  tryPlanCompatRuntimeElementGet,
} from "../compat-runtime-operations.js";

export function planElementAccessExpression(
  elementAccess: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  const expression = AsElementAccessExpression(elementAccess)!;
  const tupleDiagnosticsStart = diagnostics.length;
  const tupleElementAccess = planTupleElementAccessExpression(elementAccess, expression.Expression, sourceFile, input, diagnostics);
  if (tupleElementAccess !== undefined) {
    return tupleElementAccess;
  }
  if (diagnostics.length > tupleDiagnosticsStart) {
    return undefined;
  }
  const compatDiagnosticsStart = diagnostics.length;
  const compatRuntimeElementGet = tryPlanCompatRuntimeElementGet(elementAccess, expression.Expression, expression.ArgumentExpression, expression.QuestionDotToken !== undefined, sourceFile, input, diagnostics, planExpression);
  if (compatRuntimeElementGet !== undefined) {
    return compatRuntimeElementGet;
  }
  if (diagnostics.length > compatDiagnosticsStart) {
    return undefined;
  }
  if (!ensureElementAccessCanBeRendered(elementAccess, expression.Expression, sourceFile, input, diagnostics)) {
    return undefined;
  }
  const selectedElementAccess = input.facts.getSelectedTargetElementAccess(elementAccess);
  const csharpOperation = selectedElementAccess === undefined
    ? undefined
    : getRequiredCsharpTargetOperation(input, elementAccess, selectedElementAccess, diagnostics, "C# element access emission");
  if (selectedElementAccess !== undefined && csharpOperation === undefined) {
    return undefined;
  }
  if (selectedElementAccess !== undefined && csharpOperation?.operationId !== selectedElementAccess.operationId) {
    diagnostics.push(unsupportedNodeDiagnostic(elementAccess, "C# element access emission received mismatched or missing finalized C# target operation facts."));
    return undefined;
  }
  if (csharpOperation !== undefined && csharpOperation.kind !== "member") {
    diagnostics.push(unsupportedNodeDiagnostic(elementAccess, `C# element access emission requires a finalized member/indexer operation fact, but provider recorded '${csharpOperation.kind}'.`));
    return undefined;
  }
  if (csharpOperation?.operationKind === "method" && csharpOperation.argumentProjection !== undefined) {
    const receiver = planExpression(expression.Expression!, sourceFile, input, diagnostics);
    if (receiver === undefined) {
      return undefined;
    }
    const arguments_ = planCsharpTargetOperationArguments(csharpOperation, elementAccess, expression.ArgumentExpression, sourceFile, input, diagnostics, planExpression);
    if (arguments_ === undefined) {
      return undefined;
    }
    return {
      kind: "InvocationExpression",
      callee: {
        kind: expression.QuestionDotToken === undefined ? "SimpleMemberAccessExpression" : "ConditionalAccessExpression",
        receiver,
        name: csharpOperation.memberName,
      },
      arguments: arguments_,
    };
  }
  if (csharpOperation?.operationKind === "property") {
    if (csharpOperation.argumentProjection !== undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(elementAccess, "C# element access property lowering does not accept source argument projections."));
      return undefined;
    }
    if (csharpOperation.static === true) {
      diagnostics.push(unsupportedNodeDiagnostic(elementAccess, "C# element access property lowering requires an instance member operation fact."));
      return undefined;
    }
    const receiver = planSelectedTargetReceiverExpression(expression.Expression!, sourceFile, input, diagnostics, planExpression);
    if (receiver === undefined) {
      return undefined;
    }
    return {
      kind: expression.QuestionDotToken === undefined ? "SimpleMemberAccessExpression" : "ConditionalAccessExpression",
      receiver,
      name: csharpOperation.memberName,
    };
  }
  if (csharpOperation !== undefined && csharpOperation.operationKind !== "indexer") {
    diagnostics.push(unsupportedNodeDiagnostic(elementAccess, `C# element access emission expected an indexer operation fact or projected member call, but provider recorded '${csharpOperation.operationKind}'.`));
    return undefined;
  }
  const receiverExpression = selectedElementAccess === undefined
    ? planExpression(expression.Expression!, sourceFile, input, diagnostics)
    : planSelectedTargetReceiverExpression(expression.Expression!, sourceFile, input, diagnostics, planExpression);
  const argumentExpression = planExpression(expression.ArgumentExpression!, sourceFile, input, diagnostics);
  if (receiverExpression === undefined || argumentExpression === undefined) {
    return undefined;
  }
  return {
    kind: expression.QuestionDotToken === undefined ? "ElementAccessExpression" : "ConditionalElementAccessExpression",
    receiver: receiverExpression,
    argument: argumentExpression,
  };
}

function planTupleElementAccessExpression(
  elementAccess: Node,
  receiverNode: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  const receiverCarrier = getRuntimeCarrierForExpression(input, receiverNode, sourceFile);
  if (receiverCarrier?.kind !== "tuple") {
    return undefined;
  }
  if (input.facts.getSelectedTargetElementAccess(elementAccess) !== undefined) {
    return undefined;
  }
  diagnostics.push(unsupportedNodeDiagnostic(elementAccess, "Tuple element access requires a finalized TSTS-selected target element operation before C# emission."));
  return undefined;
}

function planCsharpTargetOperationArguments(
  operation: CsharpTargetMemberOperationFact,
  diagnosticNode: Node,
  sourceArgument: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): readonly CsharpArgument[] | undefined {
  const projection = operation.argumentProjection;
  if (projection === undefined) {
    return [];
  }
  const planned: CsharpArgument[] = [];
  for (const argument of projection) {
    const expression = planCsharpTargetOperationArgument(argument, diagnosticNode, sourceArgument, sourceFile, input, diagnostics, planExpression);
    if (expression === undefined) {
      return undefined;
    }
    planned.push({ kind: "Argument", expression });
  }
  return planned;
}

function planCsharpTargetOperationArgument(
  argument: CsharpTargetOperationArgument,
  diagnosticNode: Node,
  sourceArgument: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  switch (argument.kind) {
    case "source-argument":
      if (argument.index !== 0 || sourceArgument === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(diagnosticNode, `C# target operation argument projection requires source argument index ${argument.index}, but element access provides only index 0.`));
        return undefined;
      }
      return planExpression(sourceArgument, sourceFile, input, diagnostics);
    case "literal":
      return { kind: "LiteralExpression", value: argument.value };
  }
}

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
  csharpTypeFromTargetTypeRef,
} from "../target-types.js";
import {
  tryPlanCompatRuntimeElementGet,
} from "../compat-runtime-operations.js";
import {
  csharpTupleElementMemberName,
  getTstsTupleElementIndex,
} from "../../../source/csharp-source-semantics/tuple-element-index.js";

export function planElementAccessExpression(
  elementAccess: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  const expression = AsElementAccessExpression(elementAccess)!;
  const tupleDiagnosticsStart = diagnostics.length;
  const tupleElementAccess = planTupleElementAccessExpression(elementAccess, expression.Expression, expression.ArgumentExpression, expression.QuestionDotToken !== undefined, sourceFile, input, diagnostics, planExpression);
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
  argumentNode: Node | undefined,
  optional: boolean,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  const receiverCarrier = getRuntimeCarrierForExpression(input, receiverNode, sourceFile);
  if (receiverCarrier?.kind !== "tuple") {
    return undefined;
  }
  if (input.facts.getSelectedTargetElementAccess(elementAccess) !== undefined) {
    return undefined;
  }
  if (optional) {
    diagnostics.push(unsupportedNodeDiagnostic(elementAccess, "Optional tuple element access requires finalized nullable tuple carrier facts before C# emission."));
    return undefined;
  }
  if (receiverNode === undefined || argumentNode === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(elementAccess, "Tuple element access requires finalized receiver and argument facts before C# emission."));
    return undefined;
  }
  const index = getFinalizedTupleElementIndex(argumentNode, sourceFile, input);
  if (index === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(elementAccess, "Tuple element access requires a statically proven non-negative integer index from TSTS literal or constant facts; unproven tuple indexing needs finalized target element-access facts before C# emission."));
    return undefined;
  }
  const elementCarrier = receiverCarrier.elements[index];
  if (elementCarrier === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(elementAccess, `Tuple element access index ${index} requires a finalized tuple element carrier before C# emission.`));
    return undefined;
  }
  if (csharpTypeFromTargetTypeRef(elementCarrier) === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(elementAccess, `Tuple element access index ${index} requires a renderable tuple element carrier type before C# emission.`));
    return undefined;
  }
  const receiver = planExpression(receiverNode, sourceFile, input, diagnostics);
  if (receiver === undefined) {
    return undefined;
  }
  return {
    kind: "SimpleMemberAccessExpression",
    receiver,
    name: csharpTupleElementMemberName(index),
  };
}

function getFinalizedTupleElementIndex(
  argumentNode: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): number | undefined {
  return getTstsTupleElementIndex(argumentNode, sourceFile, input.types === undefined ? undefined : {
    kindName: (node) => input.ast.kindName(node),
    text: (node) => input.ast.text(node),
    getConstantValue: (node, options) => input.types!.getConstantValue(node, options),
    getSymbolAtLocation: (node, options) => input.analysis.getSymbolAtLocation(node, { sourceFile: options.sourceFile ?? sourceFile }),
    getResolvedSymbol: (node, options) => input.analysis.getResolvedSymbol(node, { sourceFile: options.sourceFile ?? sourceFile }),
    getSymbolDeclarations: (symbol) => input.analysis.getSymbolDeclarations(symbol),
  });
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

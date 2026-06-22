import {
  AsCallExpression,
  AsElementAccessExpression,
  AsPropertyAccessExpression,
  Node_Text,
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpArgument, CsharpExpression, CsharpTypeNode } from "../roslyn/syntax.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { invalidExpression } from "./invalid-expression.js";
import {
  planIdentifierName,
} from "./names.js";
import {
  getCallableSemanticOwnership,
  getSemanticOwnership,
  pushMissingTargetFactDiagnostic,
} from "./semantic-guards.js";
import {
  planProjectSourceModuleMemberReference,
} from "./expression-source-references.js";
import {
  ensureElementAccessCanBeRendered,
} from "./expression-element-access-rules.js";
import type {
  CallArgumentPlanner,
  ExpressionPlanner,
} from "./expression-planner-types.js";
import {
  planSelectedTargetCallee,
  planSelectedTargetCallArguments,
  planSelectedTargetReceiverExpression,
  targetStaticMemberExpression,
} from "./expression-selected-target-members.js";
import type {
  CsharpTargetMemberOperationFact,
  CsharpTargetOperationArgument,
} from "../../source/csharp-facts.js";
import {
  getRequiredCsharpTargetOperation,
  getRequiredCsharpTargetMemberOperationForSelectedSignature,
} from "./csharp-target-operations.js";
import {
  getTargetTypeRefForType,
} from "./runtime-carriers.js";
import {
  csharpTypeFromTargetTypeRef,
} from "./target-types.js";

export {
  planSelectedTargetCallArguments,
} from "./expression-selected-target-members.js";

export function planPropertyAccessExpression(
  propertyAccess: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression {
  const expression = AsPropertyAccessExpression(propertyAccess)!;
  const sourceModuleMemberReference = planProjectSourceModuleMemberReference(propertyAccess, sourceFile, input, diagnostics);
  if (sourceModuleMemberReference !== undefined) {
    return sourceModuleMemberReference;
  }
  const targetOperation = input.facts.getSelectedTargetProperty(propertyAccess);
  if (targetOperation !== undefined && targetOperation.operationKind === "property") {
    const csharpOperation = getRequiredCsharpTargetOperation(input, propertyAccess, targetOperation, diagnostics, "C# property access emission");
    if (csharpOperation === undefined) {
      return invalidExpression("missing C# target property operation fact");
    }
    const staticMember = targetStaticMemberExpression(csharpOperation, diagnostics, propertyAccess);
    if (staticMember !== undefined) {
      return staticMember;
    }
    if (csharpOperation.kind !== "member" || csharpOperation.operationKind !== "property") {
      diagnostics.push(unsupportedNodeDiagnostic(propertyAccess, "C# property access emission requires a finalized C# member property operation fact."));
      return invalidExpression("selected target property operation");
    }
    return {
      kind: expression.QuestionDotToken === undefined ? "SimpleMemberAccessExpression" : "ConditionalAccessExpression",
      receiver: planSelectedTargetReceiverExpression(expression.Expression!, sourceFile, input, diagnostics, planExpression),
      name: csharpOperation.memberName,
    };
  }
  if (targetOperation !== undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(propertyAccess, `Property access expected a provider property fact, but provider selected a ${targetOperation.operationKind} operation.`));
    return invalidExpression("selected target property");
  }
  const sourceName = Node_Text(expression.name!);
  const receiver = expression.Expression;
  const ownership = getSemanticOwnership(receiver, sourceFile, input);
  if (ownership.requiresTargetFact || !ownership.sourceOwned) {
    pushMissingTargetFactDiagnostic(diagnostics, propertyAccess, `C# property access '${sourceName}' must be selected by TSTS/provider facts before emission.`, ownership);
    return invalidExpression("missing target property fact");
  }
  return {
    kind: expression.QuestionDotToken === undefined ? "SimpleMemberAccessExpression" : "ConditionalAccessExpression",
    receiver: planExpression(expression.Expression!, sourceFile, input, diagnostics),
    name: planIdentifierName(expression.name, "InvalidPropertyName", input, diagnostics, "Source-owned property name"),
  };
}

export function planElementAccessExpression(
  elementAccess: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression {
  const expression = AsElementAccessExpression(elementAccess)!;
  if (!ensureElementAccessCanBeRendered(elementAccess, expression.Expression, sourceFile, input, diagnostics)) {
    return invalidExpression("missing target element access fact");
  }
  const selectedElementAccess = input.facts.getSelectedTargetElementAccess(elementAccess);
  const csharpOperation = selectedElementAccess === undefined
    ? undefined
    : getRequiredCsharpTargetOperation(input, elementAccess, selectedElementAccess, diagnostics, "C# element access emission");
  if (selectedElementAccess !== undefined && csharpOperation?.operationId !== selectedElementAccess.operationId) {
    diagnostics.push(unsupportedNodeDiagnostic(elementAccess, "C# element access emission received mismatched or missing finalized C# target operation facts."));
    return invalidExpression("selected target element access operation");
  }
  if (csharpOperation !== undefined && csharpOperation.kind !== "member") {
    diagnostics.push(unsupportedNodeDiagnostic(elementAccess, `C# element access emission requires a finalized member/indexer operation fact, but provider recorded '${csharpOperation.kind}'.`));
    return invalidExpression("selected target element access operation");
  }
  if (csharpOperation?.operationKind === "method" && csharpOperation.argumentProjection !== undefined) {
    const receiver = planExpression(expression.Expression!, sourceFile, input, diagnostics);
    const arguments_ = planCsharpTargetOperationArguments(csharpOperation, elementAccess, expression.ArgumentExpression, sourceFile, input, diagnostics, planExpression);
    if (arguments_ === undefined) {
      return invalidExpression("selected target element access arguments");
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
  if (csharpOperation !== undefined && csharpOperation.operationKind !== "indexer") {
    diagnostics.push(unsupportedNodeDiagnostic(elementAccess, `C# element access emission expected an indexer operation fact or projected member call, but provider recorded '${csharpOperation.operationKind}'.`));
    return invalidExpression("selected target element access operation");
  }
  return {
    kind: expression.QuestionDotToken === undefined ? "ElementAccessExpression" : "ConditionalElementAccessExpression",
    receiver: selectedElementAccess === undefined
      ? planExpression(expression.Expression!, sourceFile, input, diagnostics)
      : planSelectedTargetReceiverExpression(expression.Expression!, sourceFile, input, diagnostics, planExpression),
    argument: planExpression(expression.ArgumentExpression!, sourceFile, input, diagnostics),
  };
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

export function planCallExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planCallArgument: CallArgumentPlanner,
): CsharpExpression {
  const expression = AsCallExpression(node)!;
  const ownership = getCallableSemanticOwnership(expression.Expression, sourceFile, input);
  const selectedTargetCall = ownership.sourceOwned ? undefined : input.facts.getSelectedTargetCall(node);
  if (selectedTargetCall !== undefined) {
    const csharpOperation = getRequiredCsharpTargetMemberOperationForSelectedSignature(input, node, selectedTargetCall, diagnostics, "C# call emission");
    if (csharpOperation === undefined) {
      return invalidExpression("missing C# target call operation fact");
    }
    const member = csharpOperation.selectedMember;
    if (member === undefined) {
      return invalidExpression("missing selected target call member");
    }
    return {
      kind: "InvocationExpression",
      callee: planSelectedTargetCallee(expression.Expression, csharpOperation, sourceFile, input, diagnostics, planExpression),
      arguments: planSelectedTargetCallArguments(expression.Expression, expression, member, sourceFile, input, diagnostics, planCallArgument),
    };
  }
  if (ownership.requiresTargetFact || !ownership.sourceOwned) {
    pushMissingTargetFactDiagnostic(diagnostics, node, "C# call emission requires a source-owned callable or a selected target signature fact.", ownership);
    return invalidExpression("missing target call fact");
  }
  return {
    kind: "InvocationExpression",
    callee: planExpression(expression.Expression!, sourceFile, input, diagnostics),
    arguments: (expression.Arguments?.Nodes ?? [])
      .filter((argument): argument is Node => argument !== undefined)
      .map((argument, index) => {
        const expectedType = getResolvedSourceCallArgumentRenderType(node, index, sourceFile, input);
        return planCallArgument(argument, sourceFile, input, diagnostics, expectedType);
      }),
  };
}

function getResolvedSourceCallArgumentRenderType(
  call: Node,
  argumentIndex: number,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): CsharpTypeNode | undefined {
  const carrier = input.semantics.getResolvedCallParameterRuntimeCarriers(call, { sourceFile })?.[argumentIndex];
  if (carrier !== undefined) {
    const targetType = csharpTypeFromTargetTypeRef(carrier);
    if (targetType !== undefined) {
      return targetType;
    }
  }
  const parameterType = input.semantics.getResolvedCallParameterTypes(call, { sourceFile })?.[argumentIndex];
  const targetType = getTargetTypeRefForType(input, parameterType, sourceFile);
  return targetType === undefined ? undefined : csharpTypeFromTargetTypeRef(targetType);
}

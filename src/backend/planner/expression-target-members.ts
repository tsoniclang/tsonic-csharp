import {
  AsCallExpression,
  AsElementAccessExpression,
  AsPropertyAccessExpression,
  Node_Text,
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpExpression } from "../roslyn/syntax.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { invalidExpression } from "./invalid-expression.js";
import { sanitizeIdentifier } from "./identifiers.js";
import {
  getCallableSemanticOwnership,
  getSemanticOwnership,
  pushMissingTargetFactDiagnostic,
} from "./semantic-guards.js";
import { instantiateSelectedTargetMember } from "./target-member-instantiation.js";
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
import {
  CsharpTargetOperatorOperation,
} from "../../source/csharp-operation-tags.js";

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
    const staticMember = targetStaticMemberExpression(targetOperation, diagnostics, propertyAccess);
    if (staticMember !== undefined) {
      return staticMember;
    }
    return {
      kind: expression.QuestionDotToken === undefined ? "SimpleMemberAccessExpression" : "ConditionalAccessExpression",
      receiver: planSelectedTargetReceiverExpression(expression.Expression!, sourceFile, input, diagnostics, planExpression),
      name: targetOperation.targetOperation,
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
    name: sanitizeIdentifier(sourceName),
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
  if (selectedElementAccess?.targetOperation === CsharpTargetOperatorOperation.jsStringCodeUnit) {
    const receiver = planExpression(expression.Expression!, sourceFile, input, diagnostics);
    return {
      kind: "InvocationExpression",
      callee: {
        kind: expression.QuestionDotToken === undefined ? "SimpleMemberAccessExpression" : "ConditionalAccessExpression",
        receiver,
        name: "Substring",
      },
      arguments: [
        { kind: "Argument", expression: planExpression(expression.ArgumentExpression!, sourceFile, input, diagnostics) },
        { kind: "Argument", expression: { kind: "LiteralExpression", value: 1 } },
      ],
    };
  }
  return {
    kind: expression.QuestionDotToken === undefined ? "ElementAccessExpression" : "ConditionalElementAccessExpression",
    receiver: selectedElementAccess === undefined
      ? planExpression(expression.Expression!, sourceFile, input, diagnostics)
      : planSelectedTargetReceiverExpression(expression.Expression!, sourceFile, input, diagnostics, planExpression),
    argument: planExpression(expression.ArgumentExpression!, sourceFile, input, diagnostics),
  };
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
  const selectedTargetCall = input.facts.getSelectedTargetCall(node);
  if (selectedTargetCall !== undefined) {
    const member = instantiateSelectedTargetMember(node, selectedTargetCall, diagnostics);
    if (member === undefined) {
      return invalidExpression("selected target call type arguments");
    }
    return {
      kind: "InvocationExpression",
      callee: planSelectedTargetCallee(expression.Expression, member, sourceFile, input, diagnostics, planExpression),
      arguments: planSelectedTargetCallArguments(expression.Expression, expression, member, sourceFile, input, diagnostics, planCallArgument),
    };
  }
  const ownership = getCallableSemanticOwnership(expression.Expression, sourceFile, input);
  if (ownership.requiresTargetFact || !ownership.sourceOwned) {
    pushMissingTargetFactDiagnostic(diagnostics, node, "C# call emission requires a source-owned callable or a selected target signature fact.", ownership);
    return invalidExpression("missing target call fact");
  }
  return {
    kind: "InvocationExpression",
    callee: planExpression(expression.Expression!, sourceFile, input, diagnostics),
    arguments: (expression.Arguments?.Nodes ?? [])
      .filter((argument): argument is Node => argument !== undefined)
      .map((argument) => planCallArgument(argument, sourceFile, input, diagnostics)),
  };
}

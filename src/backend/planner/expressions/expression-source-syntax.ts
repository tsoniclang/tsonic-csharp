import type { CsharpPlanningContext } from "../context.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpExpression } from "../../target-ast/syntax/index.js";
import { AsAwaitExpression, AsNoSubstitutionTemplateLiteral, AsStringLiteral,
  KindAwaitExpression, KindBigIntLiteral, KindFalseKeyword, KindNoSubstitutionTemplateLiteral, KindNullKeyword,
  KindNumericLiteral, KindStringLiteral, KindSuperKeyword, KindThisKeyword, KindTrueKeyword,
  Node_Text, SourceKind } from "@tsonic/target-api/source";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import type { ExpressionPlanner } from "./expression-planner-types.js";
import { planCsharpExactLiteralRecipe, planIntegerLiteral } from "./literal-conversions.js";
import { requireCsharpStringRuntimeCarrier } from "./expression-literal-carriers.js";
import { csharpTypeFromTargetTypeRef } from "../types/render.js";
import { planThisExpression } from "./expression-this.js";
import { planCsharpAwaitCompletion } from "./await-completions.js";
import type { CsharpPlannedValue } from "./planned-values.js";
import { planCsharpExpressionCompletion } from "./planned-value-composition.js";
import { readCsharpNativeExpressionCarrier } from "./native-uses.js";
import { planCsharpAbsenceLiteral } from "./optional-storage.js";

export function tryPlanSourceSyntaxExpression(node: Node, sourceFile: SourceFile, input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[], planExpression: ExpressionPlanner): CsharpPlannedValue | undefined {
  const value = (expression: CsharpExpression | undefined) => planCsharpExpressionCompletion(node, sourceFile, input, diagnostics, expression,
    readCsharpNativeExpressionCarrier(input, node));
  switch (SourceKind(input.program.source.ast, node)) {
    case KindStringLiteral: return value({ kind: "LiteralExpression", value: Node_Text(input.program.source.ast, AsStringLiteral(input.program.source.ast, node)) });
    case KindNoSubstitutionTemplateLiteral:
      requireCsharpStringRuntimeCarrier(node, sourceFile, input, diagnostics, "No-substitution template literal emission");
      return value({ kind: "LiteralExpression", value: Node_Text(input.program.source.ast, AsNoSubstitutionTemplateLiteral(input.program.source.ast, node)) });
    case KindNumericLiteral:
    case KindBigIntLiteral: {
      const selection = input.program.records.literalEmission.get(node);
      if (selection === undefined) failCsharpPlannerInvariant("An admitted source literal requires its sealed native recipe.", node);
      if (selection.kind === "float64") return value({ kind: "NumericLiteralExpression", value: selection.value,
        ...(targetTypedIntegerToken(input.program.source.ast, node) ? {} : { suffix: "D" }) });
      if (selection.kind === "exact") {
        const planned = planCsharpExactLiteralRecipe(input.scope.typeParameterNames, selection.recipe);
        if (planned.kind !== "resolved") failCsharpPlannerInvariant("An admitted source literal requires its native scalar syntax.", node);
        return value(planned.expression);
      }
      const type = csharpTypeFromTargetTypeRef(selection.carrier, input.scope.typeParameterNames)
        ?? failCsharpPlannerInvariant("An admitted bigint requires its native value type.", node);
      const integer = BigInt(selection.decimal);
      if (integer >= -(1n << 63n) && integer < (1n << 64n)) {
        const literal = planIntegerLiteral(input.scope.typeParameterNames, integer, {
          kind: "source-primitive", name: integer < (1n << 63n) ? "int64" : "uint64",
        }) ?? failCsharpPlannerInvariant("An admitted bigint constructor requires its exact native integer literal.", node);
        return value({ kind: "ObjectCreationExpression", type, arguments: [{ kind: "Argument", expression: literal }] });
      }
      return value({ kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression", receiver: type, name: "Parse" },
        arguments: [{ kind: "Argument", expression: { kind: "LiteralExpression", value: selection.decimal } }] });
    }
    case KindTrueKeyword: return value({ kind: "LiteralExpression", value: true });
    case KindFalseKeyword: return value({ kind: "LiteralExpression", value: false });
    case KindNullKeyword: return value(planCsharpAbsenceLiteral(readCsharpNativeExpressionCarrier(input, node), input));
    case KindThisKeyword:
    case KindSuperKeyword: {
      const selected = value(SourceKind(input.program.source.ast, node) === KindThisKeyword
        ? planThisExpression(node, sourceFile, input, diagnostics) : { kind: "IdentifierName", name: "base" });
      return selected === undefined ? undefined : { ...selected, receiverIdentity: true, address: { kind: "root" } };
    }
    case KindAwaitExpression: {
      const expression = AsAwaitExpression(input.program.source.ast, node)?.Expression;
      const completion = input.program.records.awaitCompletion.get(node);
      const carrier = expression === undefined ? undefined : input.program.records.valueRead.get(expression)?.value;
      if (expression === undefined || completion === undefined || carrier === undefined)
        failCsharpPlannerInvariant("An admitted await requires its checked operand and native completion.", node);
      const awaited = planExpression(expression, sourceFile, input, diagnostics)
        ?? failCsharpPlannerInvariant("An admitted await requires its native operand plan.", expression);
      return planCsharpAwaitCompletion(node, carrier, completion, awaited, input, diagnostics);
    }
    default: return undefined;
  }
}

// Decision 4 (maintainer, C-2314): an authored decimal integer token, |value| <= 2^53, in a double prints as written
// exactly where C# target-types the literal to its destination: a declaration or field initializer, an assignment's
// right side, or a returned value. There C# converts the integer constant to double exactly, as at 28j'. Everywhere the
// literal's own C# type takes part in overload resolution or inference (arguments, operands, conditional arms, lambda
// bodies), it keeps the D suffix.
function targetTypedIntegerToken(ast: CsharpPlanningContext["program"]["source"]["ast"], node: Node): boolean {
  const text = ast.text(node);
  if (!/^[0-9]+$/u.test(text) || BigInt(text) > 9007199254740992n) return false;
  const parent = ast.parent(node);
  if (parent === undefined) return false;
  if (ast.is.IsVariableDeclaration(parent) || ast.is.IsPropertyDeclaration(parent)) return ast.as.AsVariableDeclaration(parent)?.Initializer === node ||
    ast.as.AsPropertyDeclaration(parent)?.Initializer === node;
  if (ast.is.IsReturnStatement(parent)) return true;
  return ast.is.IsBinaryExpression(parent) && ast.operatorKindName(parent) === "KindEqualsToken" &&
    ast.as.AsBinaryExpression(parent)?.Right === node;
}

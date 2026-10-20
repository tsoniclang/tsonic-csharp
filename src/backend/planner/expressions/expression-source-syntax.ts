import type { CsharpPlanningContext } from "../context.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpExpression } from "../../target-ast/syntax/index.js";
import { AsAwaitExpression, AsNoSubstitutionTemplateLiteral, AsStringLiteral,
  KindAwaitExpression, KindBigIntLiteral, KindFalseKeyword, KindNoSubstitutionTemplateLiteral, KindNullKeyword,
  KindNumericLiteral, KindStringLiteral, KindSuperKeyword, KindThisKeyword, KindTrueKeyword,
  Node_Text, SourceKind } from "@tsonic/target-api/source";
import { failCsharpPlannerInvariant } from "../../invariants.js";
import type { ExpressionPlanner } from "./expression-planner-types.js";
import { planIntegerLiteral, planCsharpExactLiteralRecipe } from "./literal-conversions.js";
import { requireCsharpStringRuntimeCarrier } from "./expression-literal-carriers.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import { planThisExpression } from "./expression-this.js";
import { planCsharpAwaitCompletion } from "./await-completions.js";
import type { CsharpPlannedValue } from "./planned-values.js";
import { planCsharpExpressionCompletion } from "./planned-value-composition.js";
import { readCsharpNativeExpressionCarrier } from "./native-uses.js";

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
      if (selection.kind === "float64") return value({ kind: "NumericLiteralExpression", value: selection.value, suffix: "D" });
      if (selection.kind === "exact") {
        const planned = planCsharpExactLiteralRecipe(input.scope.typeParameterNames, selection.recipe);
        if (planned.kind !== "resolved") failCsharpPlannerInvariant("An admitted source literal requires its native scalar syntax.", node);
        return value(planned.expression);
      }
      const type = csharpTypeFromTargetTypeRef(selection.carrier, input.scope.typeParameterNames)
        ?? failCsharpPlannerInvariant("An admitted bigint requires its native value type.", node);
      const storage = selection.storage;
      const argumentsList: CsharpExpression[] = storage.kind === "bytes" ? [
        { kind: "CollectionExpression", elements: storage.bytes.map(value => ({ kind: "ExpressionElement", expression: { kind: "LiteralExpression", value } })) },
        { kind: "LiteralExpression", value: true }, { kind: "LiteralExpression", value: false },
      ] : [planIntegerLiteral(input.scope.typeParameterNames, storage.value, { kind: "source-primitive", name: storage.kind })
        ?? failCsharpPlannerInvariant("An admitted bigint requires its exact native scalar bits.", node)];
      const created: CsharpExpression = { kind: "ObjectCreationExpression", type,
        arguments: argumentsList.map(expression => ({ kind: "Argument", expression })) };
      return value(selection.negative ? { kind: "PrefixUnaryExpression", operatorToken: { kind: "MinusToken" }, operand: created } : created);
    }
    case KindTrueKeyword: return value({ kind: "LiteralExpression", value: true });
    case KindFalseKeyword: return value({ kind: "LiteralExpression", value: false });
    case KindNullKeyword: return value({ kind: "LiteralExpression", value: null });
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

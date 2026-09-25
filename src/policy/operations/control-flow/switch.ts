import type { Node, SourceFile } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../model/context.js";
import { csharpSourcePrimitiveTargetType, isCsharpIntegralTargetType, isCsharpStringTargetType, targetTypeRefEquals, type TargetTypeRef } from "../../types/index.js";
import { selectCsharpBinaryOperands, type CsharpResolvedBinaryOperation } from "../operators/operator-selection.js";

export type CsharpSwitchSelection =
  | { readonly kind: "native" }
  | {
      readonly kind: "ordered";
      readonly expression: Node;
      readonly type: TargetTypeRef;
      readonly clauses: readonly { readonly node: Node; readonly comparison?: CsharpResolvedBinaryOperation }[];
      readonly defaultIndex: number;
    }
  | { readonly kind: "rejected"; readonly reason: string };

export function selectCsharpSwitch(input: CsharpPolicyContext, node: Node, sourceFile: SourceFile): CsharpSwitchSelection {
  const statement = input.ast.as.AsSwitchStatement(node);
  const expression = statement?.Expression;
  const block = statement?.CaseBlock === undefined ? undefined : input.ast.as.AsCaseBlock(statement.CaseBlock);
  const clauses = block?.Clauses?.Nodes.filter((clause): clause is Node => clause !== undefined);
  if (expression === undefined || clauses === undefined) return { kind: "rejected", reason: "Switch requires its exact governing expression and clauses." };
  const type = input.types.resolveNode(expression, sourceFile);
  if (type === undefined) return { kind: "rejected", reason: "Switch governing expression has no closed native carrier." };
  const defaults = clauses.filter(clause => input.ast.is.IsDefaultClause(clause));
  if (defaults.length > 1) return { kind: "rejected", reason: "Switch cannot contain multiple default clauses." };
  const native = isCsharpIntegralTargetType(type) || isCsharpStringTargetType(type) ||
    ["float32", "float64", "bool"].some(name => targetTypeRefEquals(type, csharpSourcePrimitiveTargetType(name as "float32" | "float64" | "bool")));
  if (native && clauses.every(clause => input.ast.is.IsDefaultClause(clause) ||
    constantLabel(input, input.ast.as.AsCaseOrDefaultClause(clause)?.Expression))) return { kind: "native" };
  const selected: { readonly node: Node; readonly comparison?: CsharpResolvedBinaryOperation }[] = [];
  for (const clause of clauses) {
    if (input.ast.is.IsDefaultClause(clause)) {
      selected.push({ node: clause });
      continue;
    }
    const candidate = input.ast.as.AsCaseOrDefaultClause(clause)?.Expression;
    if (candidate === undefined) return { kind: "rejected", reason: "Switch case has no checked expression." };
    const comparison = selectCsharpBinaryOperands(input, expression, candidate, "===",
      csharpSourcePrimitiveTargetType("bool"), operand => input.types.resolveNode(operand, sourceFile));
    if (comparison.kind === "rejected") return comparison;
    selected.push({ node: clause, comparison });
  }
  return { kind: "ordered", expression, type, clauses: Object.freeze(selected),
    defaultIndex: clauses.findIndex(clause => input.ast.is.IsDefaultClause(clause)) };
}

function constantLabel(input: CsharpPolicyContext, node: Node | undefined): boolean {
  if (node === undefined) return false;
  switch (input.ast.kindName(node)) {
    case "KindStringLiteral":
    case "KindNoSubstitutionTemplateLiteral":
    case "KindNumericLiteral":
    case "KindTrueKeyword":
    case "KindFalseKeyword":
    case "KindNullKeyword":
      return true;
    case "KindAsExpression": return constantLabel(input, input.ast.as.AsAsExpression(node)?.Expression);
    case "KindSatisfiesExpression": return constantLabel(input, input.ast.as.AsSatisfiesExpression(node)?.Expression);
    case "KindNonNullExpression": return constantLabel(input, input.ast.as.AsNonNullExpression(node)?.Expression);
    case "KindTypeAssertionExpression": return constantLabel(input, input.ast.as.AsTypeAssertion(node)?.Expression);
    case "KindParenthesizedExpression": return constantLabel(input, input.ast.as.AsParenthesizedExpression(node)?.Expression);
    default: return false;
  }
}

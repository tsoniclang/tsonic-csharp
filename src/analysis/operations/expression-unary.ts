import type { AstReader, Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { SourceLiteralIndex } from "@tsonic/target-api/source";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { CsharpExactLiteralSelectionIndex } from "../../target-model/conversions/exact-literals.js";
import { createCsharpUnaryEmissionProducer } from "../program/records/expression-unary.js";

export function analyzeCsharpUnaryEmission(input: { readonly ast: AstReader; readonly nodes: readonly Node[];
  readonly admitted: (node: Node) => boolean; readonly operations: CsharpTargetOperationClassifications;
  readonly literals: SourceLiteralIndex; readonly exact: CsharpExactLiteralSelectionIndex }) {
  const producer = createCsharpUnaryEmissionProducer();
  const issues: TargetDiagnostic[] = [];
  const refuse = (node: Node, message: string): void => { issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", sourceNode: node, message }); };
  for (const node of input.nodes) {
    if (!input.admitted(node) || !input.ast.is.IsPrefixUnaryExpression(node) && !input.ast.is.IsPostfixUnaryExpression(node)) continue;
    const classification = input.operations.unaryOperation.get(node);
    if (classification === undefined) { refuse(node, "C# planning received a unary expression without a sealed target classification."); continue; }
    const form = input.operations.operatorForm.get(node);
    if (form === "js-value-operation") {
      const selected = classification.jsValue;
      if (selected.kind === "rejected") { refuse(node, selected.reason); continue; }
      const operand = input.ast.is.IsPrefixUnaryExpression(node) ? input.ast.as.AsPrefixUnaryExpression(node)?.Operand
        : input.ast.as.AsPostfixUnaryExpression(node)?.Operand;
      if (selected.kind !== "resolved" || operand === undefined) { refuse(node, "C# planning received a unary expression without a sealed target classification."); continue; }
      producer.publish(node, { kind: "js-value", operand, invocation: selected });
      continue;
    }
    const selected = classification.target;
    if (selected.kind === "rejected") { refuse(node, selected.reason); continue; }
    const postfix = input.ast.is.IsPostfixUnaryExpression(node);
    if (!postfix && Object.is(input.literals.literalValue.get(node)?.number, -0)) {
      const literal = input.exact.exactLiteral.get(node, selected.resultType);
      if (literal?.kind === "resolved") { producer.publish(node, { kind: "literal", carrier: selected.resultType, recipe: literal.recipe }); continue; }
      if (literal?.kind === "rejected") { refuse(node, literal.reason); continue; }
    }
    if (!(postfix ? ["++", "--"] : ["+", "-", "~", "!", "++", "--"]).includes(selected.targetOperator)) {
      refuse(node, `Selected ${postfix ? "postfix" : "prefix"} operator '${selected.targetOperator}' has no C# AST token.`);
      continue;
    }
    let storage: Node | undefined;
    if (selected.sourceOperator === "++" || selected.sourceOperator === "--") {
      storage = selected.operand;
      while (storage !== undefined && input.ast.is.IsParenthesizedExpression(storage)) {
        const inner: Node | undefined = input.ast.as.AsParenthesizedExpression(storage)?.Expression;
        if (inner === undefined) { refuse(storage, "A selected parenthesized native update location has no operand."); storage = undefined; break; }
        storage = inner;
      }
      if (storage === undefined) continue;
    }
    producer.publish(node, { kind: "native", operand: selected.operand, carrier: selected.resultType,
      operator: selected.targetOperator, postfix, storage });
  }
  return Object.freeze({ records: producer.seal(), issues: Object.freeze(issues) });
}

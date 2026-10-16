import type { AstReader, Node } from "@tsonic/tsts";
import { targetUseSiteIdentity, type TargetUseSiteRef } from "@tsonic/target-api/analysis";
import type { CsharpExactLiteralSelection } from "../../target-model/conversions/exact-literals.js";
import type { CsharpConversionMode } from "../../target-model/conversions/selection.js";
import {
  csharpNativeUseSite,
  type CsharpExpectedNativeUse,
  type CsharpNativeCallableCreation,
  type CsharpNativeUseSlot,
} from "../../target-model/records/native-demand.js";
import type { CsharpOperationSelection, CsharpResolvedBinaryOperation } from "../../target-model/records/operator-selection.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";

export interface CsharpNativeRepresentationChild {
  readonly site: TargetUseSiteRef;
  readonly expression?: Node;
  readonly target?: TargetTypeRef;
}

export interface CsharpNativeRepresentationInput {
  readonly ast: AstReader;
  readonly expression: Node;
  readonly target: TargetTypeRef;
  readonly mode: CsharpConversionMode;
  readonly source?: TargetTypeRef;
  readonly absent: boolean;
  readonly literal: CsharpExactLiteralSelection | undefined;
  readonly callable: CsharpNativeCallableCreation | undefined;
  readonly constructionCarrier?: TargetTypeRef;
  readonly binary: CsharpOperationSelection<CsharpResolvedBinaryOperation> | undefined;
  readonly children: ReadonlyMap<string, CsharpNativeRepresentationChild>;
}

export type CsharpNativeRepresentationPending =
  | "source-unresolved" | "literal-unrequested" | "literal-rejected" | "callable-creation" | "callable-discarded"
  | "construction-unresolved" | "operation-unresolved" | "forwarding-child-unresolved";

export type CsharpNativeRepresentationSelection =
  | { readonly kind: "pending"; readonly reason: CsharpNativeRepresentationPending }
  | { readonly kind: "selected"; readonly representation: CsharpExpectedNativeUse["representation"];
      readonly carrier: TargetTypeRef; readonly children: readonly TargetUseSiteRef[];
      readonly literal?: CsharpExpectedNativeUse["literal"];
      readonly binary?: CsharpResolvedBinaryOperation;
      readonly construction?: CsharpExpectedNativeUse["construction"] };

export function selectCsharpNativeUseRepresentation(input: CsharpNativeRepresentationInput): CsharpNativeRepresentationSelection {
  const { ast, expression, target } = input;
  const none: readonly TargetUseSiteRef[] = Object.freeze([]);
  const selected = (representation: CsharpExpectedNativeUse["representation"], carrier: TargetTypeRef,
    children: readonly TargetUseSiteRef[] = none): CsharpNativeRepresentationSelection =>
    Object.freeze({ kind: "selected", representation, carrier, children: Object.freeze([...children]) });
  const pending = (reason: CsharpNativeRepresentationPending): CsharpNativeRepresentationSelection => Object.freeze({ kind: "pending", reason });
  const child = (node: Node | undefined, slot: CsharpNativeUseSlot, carrier: TargetTypeRef): TargetUseSiteRef | undefined => {
    if (node === undefined) return undefined;
    const site = csharpNativeUseSite(expression, slot, { target: carrier, mode: input.mode });
    const entry = input.children.get(targetUseSiteIdentity(site));
    return entry?.expression === node && entry.target !== undefined && targetTypeRefEquals(entry.target, carrier) ? entry.site : undefined;
  };
  const forward = (node: Node | undefined): CsharpNativeRepresentationSelection => {
    const site = child(node, { kind: "operand", position: "only" }, target);
    return site === undefined ? pending("forwarding-child-unresolved") : selected("forward", target, [site]);
  };

  if (ast.is.IsBinaryExpression(expression) && input.binary?.kind === "resolved") {
    const binary = input.binary;
    const left = child(binary.left, { kind: "operand", position: "left" }, binary.leftInputType);
    const rightNeeded = binary.targetOperation.kind !== "conditional-value" || binary.targetOperation.branch !== "left";
    const right = rightNeeded ? child(binary.right, { kind: "operand", position: "right" }, binary.rightInputType) : undefined;
    if (left === undefined || rightNeeded && right === undefined) return pending("forwarding-child-unresolved");
    const children = right === undefined ? [left] : [left, right];
    if (binary.targetOperation.kind === "conditional-value" && binary.targetOperation.branch !== "right") {
      const present = child(binary.left, { kind: "present-payload" }, binary.resultType);
      if (present === undefined) return pending("forwarding-child-unresolved");
      children.push(present);
    }
    return Object.freeze({ kind: "selected", representation: targetTypeRefEquals(binary.resultType, target) ? "construct" : "convert",
      carrier: binary.resultType, children: Object.freeze(children), binary });
  }
  if (input.absent) return input.source === undefined ? pending("source-unresolved")
    : selected(targetTypeRefEquals(input.source, target) ? "forward" : "convert", input.source);
  if (input.literal === undefined) return pending("literal-unrequested");
  if (input.literal.kind === "rejected") return pending("literal-rejected");
  if (input.literal.kind === "resolved") return Object.freeze({
    kind: "selected", representation: "construct", carrier: target, children: none, literal: input.literal.recipe,
  });
  if (ast.isConstAssertion(expression)) {
    const assertion = ast.is.IsAsExpression(expression) ? ast.as.AsAsExpression(expression) : ast.as.AsTypeAssertion(expression);
    return forward(assertion?.Expression);
  }
  if (ast.is.IsParenthesizedExpression(expression)) return forward(ast.as.AsParenthesizedExpression(expression)?.Expression);
  if (ast.is.IsSatisfiesExpression(expression)) return forward(ast.as.AsSatisfiesExpression(expression)?.Expression);
  if (ast.is.IsConditionalExpression(expression)) {
    const conditional = ast.as.AsConditionalExpression(expression);
    const whenTrue = child(conditional?.WhenTrue, { kind: "branch", branch: "true" }, target);
    const whenFalse = child(conditional?.WhenFalse, { kind: "branch", branch: "false" }, target);
    return whenTrue === undefined || whenFalse === undefined ? pending("forwarding-child-unresolved")
      : selected("forward", target, [whenTrue, whenFalse]);
  }
  if (ast.is.IsArrowFunction(expression) || ast.is.IsFunctionExpression(expression)) {
    if (input.callable === undefined || input.callable.kind === "pending") return pending("callable-creation");
    if (input.callable.kind === "discarded") return pending("callable-discarded");
    return selected(targetTypeRefEquals(input.callable.carrier, target) ? "construct" : "convert", input.callable.carrier);
  }
  if (ast.is.IsArrayLiteralExpression(expression) || ast.is.IsObjectLiteralExpression(expression)) {
    const carrier = input.constructionCarrier;
    if (carrier === undefined) return pending("construction-unresolved");
    const prefix = ast.is.IsArrayLiteralExpression(expression) ? "element:" : "member:";
    const children = Object.freeze([...input.children.values()].filter(entry => entry.site.role.startsWith(prefix)).map(entry => entry.site));
    if (targetTypeRefEquals(carrier, target)) return selected("construct", carrier, children);
    const site = csharpNativeUseSite(expression, { kind: "constructed-result" }, { target, mode: input.mode });
    return Object.freeze({ kind: "selected", representation: "convert", carrier, children: Object.freeze([site]),
      construction: Object.freeze({ site, carrier, children }) });
  }
  return input.source === undefined ? pending("source-unresolved")
    : selected(targetTypeRefEquals(input.source, target) ? "forward" : "convert", input.source);
}

import type { Node } from "@tsonic/tsts";
import { targetUseSiteIdentity, type TargetUseSiteRef } from "@tsonic/target-api/analysis";

import { csharpNativeUseSite, type CsharpExpectedNativeUse, type CsharpNativeUseSlot } from "../../target-model/records/native-demand.js";

import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import { csharpSourcePrimitiveTargetType } from "../../target-model/types/carriers/scalar-types.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";

import type { CsharpNativeRepresentationInput } from "../model/native-use-representation.js";
import type { CsharpNativeRepresentationPending, CsharpNativeRepresentationSelection } from "../../target-model/records/native-representation.js";
export function selectCsharpNativeUseRepresentation(input: CsharpNativeRepresentationInput): CsharpNativeRepresentationSelection {
  const { ast, expression, target } = input;
  const none: readonly TargetUseSiteRef[] = Object.freeze([]);
  const selected = (representation: CsharpExpectedNativeUse["representation"], carrier: TargetTypeRef,
    children: readonly TargetUseSiteRef[] = none): CsharpNativeRepresentationSelection =>
    Object.freeze({ kind: "selected", representation, carrier, children: Object.freeze([...children]) });
  const pending = (reason: CsharpNativeRepresentationPending, message?: string): CsharpNativeRepresentationSelection =>
    Object.freeze({ kind: "pending", reason, ...(message === undefined ? {} : { message }) });
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
  const construct = (carrier: TargetTypeRef, children: readonly TargetUseSiteRef[],
    literal?: CsharpExpectedNativeUse["literal"]): CsharpNativeRepresentationSelection => {
    const value = literal === undefined ? {} : { literal };
    if (targetTypeRefEquals(carrier, target)) return Object.freeze({ ...selected("construct", carrier, children), ...value });
    const site = csharpNativeUseSite(expression, { kind: "constructed-result" }, { target, mode: input.mode });
    return Object.freeze({ kind: "selected", representation: "convert", carrier, children: Object.freeze([site]), ...value,
      construction: Object.freeze({ site, carrier, children: Object.freeze([...children]) }) });
  };

  if (input.projection === "present-payload") return input.source === undefined ? pending("source-unresolved")
    : selected(targetTypeRefEquals(input.source, target) ? "forward" : "convert", input.source);

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
  if (!input.absent) {
    if (input.literal === undefined) return pending("literal-unrequested");
    // An explicit conversion of a numeric literal outside its target range (`1e40 as float32`) reads the literal as a
    // double and casts it, as C# does; an implicit use stays refused.
    if (input.literal.kind === "rejected") return input.mode === "explicit" && ast.is.IsNumericLiteral(expression)
      ? selected("convert", csharpSourcePrimitiveTargetType("float64")) : pending("literal-rejected", input.literal.reason);
    if (input.literal.kind === "resolved") return construct(input.constructionCarrier ?? target, none, input.literal.recipe);
  }
  if (input.constructionCarrier !== undefined && !ast.is.IsArrayLiteralExpression(expression) && !ast.is.IsObjectLiteralExpression(expression)) {
    const operand = ast.is.IsParenthesizedExpression(expression) ? ast.as.AsParenthesizedExpression(expression)?.Expression : undefined;
    const site = operand === undefined ? undefined : child(operand, { kind: "operand", position: "only" }, input.constructionCarrier);
    return operand !== undefined && site === undefined ? pending("forwarding-child-unresolved")
      : construct(input.constructionCarrier, site === undefined ? none : [site]);
  }
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
  if (input.absent) return input.source === undefined ? pending("source-unresolved")
    : selected(targetTypeRefEquals(input.source, target) ? "forward" : "convert", input.source);
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
    return construct(carrier, children);
  }
  return input.source === undefined ? pending("source-unresolved")
    : selected(targetTypeRefEquals(input.source, target) ? "forward" : "convert", input.source);
}

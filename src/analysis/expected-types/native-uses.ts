import type { AstReader, Node } from "@tsonic/tsts";
import {
  createTargetClassificationKey,
  createTargetUseClassificationBuilder,
  type TargetUseSiteRef,
} from "@tsonic/target-api/analysis";
import { getCsharpDelegateSignature, targetTypeRefKey } from "../../policy/types/index.js";
import {
  csharpNativeUseSite,
  type CsharpExpectedNativeUse,
  type CsharpExpectedNativeUseInput,
} from "../../target-model/records/native-demand.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpExpectedUseSite } from "./collection.js";
import type { CsharpExpectedBinarySelection } from "./propagation.js";

export interface CsharpExpectedNativeUseAdmissionInput {
  readonly ast: AstReader;
  readonly sites: readonly CsharpExpectedUseSite[];
  readonly sitesOf: (expression: Node) => readonly CsharpExpectedUseSite[];
  readonly expectedBinary: (expression: Node, targetType: TargetTypeRef) => CsharpExpectedBinarySelection | undefined;
  readonly intrinsicTarget: (expression: Node, targetType: TargetTypeRef) => boolean;
  readonly callableTarget: (expression: Node) => TargetTypeRef | undefined;
  readonly absentValue: (expression: Node) => boolean;
}

export interface CsharpExpectedNativeUseAdmission extends CsharpExpectedNativeUseInput {
  readonly entries: readonly { readonly site: TargetUseSiteRef; readonly use: CsharpExpectedNativeUse }[];
  readonly unresolved: readonly TargetUseSiteRef[];
}

const expectedUseKey = createTargetClassificationKey<CsharpExpectedNativeUse>("csharp.expected-type.native-use");

export function admitCsharpExpectedNativeUses(input: CsharpExpectedNativeUseAdmissionInput): CsharpExpectedNativeUseAdmission {
  const { ast } = input;
  const admitted = new Map<CsharpExpectedUseSite, CsharpExpectedNativeUse | null>();
  const unresolved: TargetUseSiteRef[] = [];
  for (const site of input.sites) resolve(site);
  const builder = createTargetUseClassificationBuilder();
  const entries: { readonly site: TargetUseSiteRef; readonly use: CsharpExpectedNativeUse }[] = [];
  for (const site of input.sites) {
    const use = admitted.get(site);
    if (use === null || use === undefined) continue;
    if (builder.set(site.site, expectedUseKey, use).kind === "conflict") {
      throw new Error(`Conflicting C# expected use for role '${site.site.role}'.`);
    }
    entries.push(Object.freeze({ site: site.site, use }));
  }
  const sealed = builder.seal();
  return Object.freeze({
    expectedUse: Object.freeze({ get: (site: TargetUseSiteRef) => sealed.get(site, expectedUseKey) }),
    entries: Object.freeze(entries),
    unresolved: Object.freeze(unresolved),
  });

  function resolve(root: CsharpExpectedUseSite): void {
    const stack = [root];
    const active = new Set([root]);
    while (stack.length > 0) {
      const site = stack[stack.length - 1]!;
      if (admitted.has(site)) {
        stack.pop();
        active.delete(site);
        continue;
      }
      const owner = forwardingOwner(site);
      const next = owner === undefined ? undefined
        : input.sitesOf(owner).find(candidate => !admitted.has(candidate) && !active.has(candidate));
      if (next !== undefined) {
        stack.push(next);
        active.add(next);
        continue;
      }
      admitted.set(site, decide(site));
      stack.pop();
      active.delete(site);
    }
  }

  function forwardingOwner(site: CsharpExpectedUseSite): Node | undefined {
    return site.demands.some(demand => demand.forwardedFrom !== undefined) ? site.site.subject as Node : undefined;
  }

  function decide(site: CsharpExpectedUseSite): CsharpExpectedNativeUse | null {
    const owner = site.site.subject as Node;
    const ownerUses = input.sitesOf(owner).flatMap(candidate => {
      const use = admitted.get(candidate);
      return use === null || use === undefined ? [] : [use];
    });
    const passes = (targetType: TargetTypeRef) => ownerUses.some(use => use.representation !== "convert" &&
      targetTypeRefKey(use.target) === targetTypeRefKey(targetType));
    const forwarded = site.demands.filter(demand => demand.forwardedFrom !== undefined &&
      (passes(demand.forwardedFrom) || ownerUses.length === 0 && input.intrinsicTarget(owner, demand.forwardedFrom)));
    const chosen = forwarded.length > 0 ? forwarded : site.demands.filter(demand => demand.forwardedFrom === undefined);
    if (chosen.length === 0) return null;
    const byTarget = new Map<string, { readonly targetType: TargetTypeRef; readonly required: boolean }>();
    for (const demand of chosen) {
      const key = targetTypeRefKey(demand.targetType);
      byTarget.set(key, { targetType: demand.targetType, required: byTarget.get(key)?.required === true || demand.strength === "required" });
    }
    const candidates = byTarget.size > 1 ? [...byTarget.values()].filter(candidate => candidate.required) : [...byTarget.values()];
    if (candidates.length !== 1) {
      unresolved.push(site.site);
      return null;
    }
    const { targetType, required } = candidates[0]!;
    const expression = chosen[0]!.expression;
    const shape = representation(expression, targetType);
    return Object.freeze({
      expression,
      target: targetType,
      strength: required ? "required" : "contextual",
      representation: shape.representation,
      mode: "implicit",
      children: Object.freeze(shape.children),
    });
  }

  function representation(expression: Node, targetType: TargetTypeRef): {
    readonly representation: CsharpExpectedNativeUse["representation"];
    readonly children: readonly TargetUseSiteRef[];
  } {
    const only = (node: Node | undefined) => node === undefined ? [] : [csharpNativeUseSite(expression, { kind: "operand", position: "only" })];
    if (input.absentValue(expression)) return { representation: "construct", children: [] };
    if (ast.isConstAssertion(expression)) {
      const assertion = ast.is.IsAsExpression(expression) ? ast.as.AsAsExpression(expression) : ast.as.AsTypeAssertion(expression);
      return { representation: "forward", children: only(assertion?.Expression) };
    }
    if (ast.is.IsParenthesizedExpression(expression)) {
      return { representation: "forward", children: only(ast.as.AsParenthesizedExpression(expression)?.Expression) };
    }
    if (ast.is.IsSatisfiesExpression(expression)) {
      return { representation: "forward", children: only(ast.as.AsSatisfiesExpression(expression)?.Expression) };
    }
    if (ast.is.IsConditionalExpression(expression)) {
      const conditional = ast.as.AsConditionalExpression(expression);
      return { representation: "forward", children: [
        ...(conditional?.Condition === undefined ? [] : [csharpNativeUseSite(expression, { kind: "condition" })]),
        ...(conditional?.WhenTrue === undefined ? [] : [csharpNativeUseSite(expression, { kind: "branch", branch: "true" })]),
        ...(conditional?.WhenFalse === undefined ? [] : [csharpNativeUseSite(expression, { kind: "branch", branch: "false" })]),
      ] };
    }
    if (ast.is.IsBinaryExpression(expression)) {
      const selection = input.expectedBinary(expression, targetType);
      if (selection?.kind !== "resolved" || targetTypeRefKey(selection.resultType) !== targetTypeRefKey(targetType)) {
        return { representation: "convert", children: [] };
      }
      const leftOnly = selection.targetOperation.kind === "conditional-value" && selection.targetOperation.branch === "left";
      return { representation: "construct", children: [
        csharpNativeUseSite(expression, { kind: "operand", position: "left" }),
        ...(leftOnly ? [] : [csharpNativeUseSite(expression, { kind: "operand", position: "right" })]),
      ] };
    }
    if (ast.is.IsArrowFunction(expression) || ast.is.IsFunctionExpression(expression)) {
      const callable = input.callableTarget(expression);
      if (getCsharpDelegateSignature(targetType) === undefined || callable === undefined ||
        targetTypeRefKey(callable) !== targetTypeRefKey(targetType)) return { representation: "convert", children: [] };
      const body = ast.is.IsArrowFunction(expression) ? ast.as.AsArrowFunction(expression)?.Body : undefined;
      return { representation: "construct", children: body === undefined || ast.is.IsBlock(body) ? []
        : [csharpNativeUseSite(expression, { kind: "return" })] };
    }
    if (ast.is.IsArrayLiteralExpression(expression)) {
      return { representation: "construct", children: ast.children(expression).flatMap((element, index) =>
        element === undefined ? [] : [csharpNativeUseSite(expression, { kind: "element", index })]) };
    }
    if (ast.is.IsObjectLiteralExpression(expression)) {
      return { representation: "construct", children: ast.children(expression).flatMap((member, index) => {
        const value = member === undefined ? undefined
          : ast.is.IsPropertyAssignment(member) ? ast.as.AsPropertyAssignment(member)?.Initializer
          : ast.is.IsShorthandPropertyAssignment(member) ? ast.name(member)
          : ast.is.IsSpreadAssignment(member) ? ast.as.AsSpreadAssignment(member)?.Expression : undefined;
        return value === undefined ? [] : [csharpNativeUseSite(expression, { kind: "member", index })];
      }) };
    }
    return { representation: "convert", children: [] };
  }
}

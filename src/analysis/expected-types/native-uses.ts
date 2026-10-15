import type { AstReader, Node } from "@tsonic/tsts";
import {
  createTargetClassificationKey,
  createTargetUseClassificationBuilder,
  type TargetUseSiteRef,
} from "@tsonic/target-api/analysis";
import { targetTypeRefKey } from "../../policy/types/index.js";
import {
  csharpNativeUseSite,
  type CsharpExpectedNativeUse,
  type CsharpExpectedNativeUseInput,
} from "../../target-model/records/native-demand.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpExpectedUseSite } from "./collection.js";
import type { CsharpExpectedUseWithholding } from "./model.js";
import type { CsharpExpectedBinarySelection } from "./propagation.js";

export interface CsharpExpectedNativeUseAdmissionInput {
  readonly ast: AstReader;
  readonly sites: readonly CsharpExpectedUseSite[];
  readonly sitesOf: (expression: Node) => readonly CsharpExpectedUseSite[];
  readonly withheldOf: (expression: Node) => readonly CsharpExpectedUseWithholding[];
  readonly expectedBinary: (expression: Node, targetType: TargetTypeRef) => CsharpExpectedBinarySelection | undefined;
  readonly intrinsicTarget: (expression: Node, targetType: TargetTypeRef) => boolean;
  readonly constructionCarrier: (expression: Node, targetType: TargetTypeRef) => TargetTypeRef | undefined;
  readonly absentValue: (expression: Node) => boolean;
}

export type CsharpExpectedUsePending =
  | { readonly reason: "ambiguous-target"; readonly targets: readonly TargetTypeRef[] }
  | { readonly reason: "owner-unresolved"; readonly owner: Node }
  | { readonly reason: "callable-creation"; readonly expression: Node; readonly target: TargetTypeRef }
  | { readonly reason: "construction-unresolved"; readonly expression: Node; readonly target: TargetTypeRef }
  | { readonly reason: "construction-conversion"; readonly expression: Node; readonly target: TargetTypeRef;
      readonly carrier: TargetTypeRef; readonly children: readonly TargetUseSiteRef[] };

export interface CsharpExpectedNativeUseAdmission extends CsharpExpectedNativeUseInput {
  readonly entries: readonly { readonly site: TargetUseSiteRef; readonly use: CsharpExpectedNativeUse }[];
  readonly pending: readonly { readonly site: TargetUseSiteRef; readonly pending: CsharpExpectedUsePending }[];
}

type SiteState =
  | { readonly kind: "admitted"; readonly use: CsharpExpectedNativeUse }
  | { readonly kind: "pending"; readonly pending: CsharpExpectedUsePending }
  | { readonly kind: "none" };

type Representation =
  | { readonly representation: CsharpExpectedNativeUse["representation"]; readonly children: readonly TargetUseSiteRef[] }
  | { readonly pending: CsharpExpectedUsePending };

const expectedUseKey = createTargetClassificationKey<CsharpExpectedNativeUse>("csharp.expected-type.native-use");
const noUse: SiteState = Object.freeze({ kind: "none" });

export function admitCsharpExpectedNativeUses(input: CsharpExpectedNativeUseAdmissionInput): CsharpExpectedNativeUseAdmission {
  const { ast } = input;
  const states = new Map<CsharpExpectedUseSite, SiteState>();
  for (const site of input.sites) resolve(site);
  const builder = createTargetUseClassificationBuilder();
  const entries: { readonly site: TargetUseSiteRef; readonly use: CsharpExpectedNativeUse }[] = [];
  const pending: { readonly site: TargetUseSiteRef; readonly pending: CsharpExpectedUsePending }[] = [];
  for (const site of input.sites) {
    const state = states.get(site)!;
    if (state.kind === "pending") pending.push(Object.freeze({ site: site.site, pending: state.pending }));
    if (state.kind !== "admitted") continue;
    if (builder.set(site.site, expectedUseKey, state.use).kind === "conflict") {
      throw new Error(`Conflicting C# expected use for role '${site.site.role}'.`);
    }
    entries.push(Object.freeze({ site: site.site, use: state.use }));
  }
  const sealed = builder.seal();
  return Object.freeze({
    expectedUse: Object.freeze({ get: (site: TargetUseSiteRef) => sealed.get(site, expectedUseKey) }),
    entries: Object.freeze(entries),
    pending: Object.freeze(pending),
  });

  function resolve(root: CsharpExpectedUseSite): void {
    const stack = [root];
    const active = new Set([root]);
    while (stack.length > 0) {
      const site = stack[stack.length - 1]!;
      if (states.has(site)) {
        stack.pop();
        active.delete(site);
        continue;
      }
      const owner = forwardingOwner(site);
      const next = owner === undefined ? undefined
        : input.sitesOf(owner).find(candidate => !states.has(candidate) && !active.has(candidate));
      if (next !== undefined) {
        stack.push(next);
        active.add(next);
        continue;
      }
      states.set(site, decide(site));
      stack.pop();
      active.delete(site);
    }
  }

  function forwardingOwner(site: CsharpExpectedUseSite): Node | undefined {
    return site.demands.some(demand => demand.forwardedFrom !== undefined) ? site.site.subject as Node : undefined;
  }

  function ownerState(owner: Node): { readonly passes: (targetType: TargetTypeRef) => boolean; readonly absent: boolean } {
    const ownerStates = input.sitesOf(owner).map(candidate => states.get(candidate) ?? noUse);
    const passing = ownerStates.flatMap(state =>
      state.kind === "admitted" && state.use.representation !== "convert" ? [targetTypeRefKey(state.use.target)]
      : state.kind === "pending" && state.pending.reason === "construction-conversion" ? [targetTypeRefKey(state.pending.target)]
      : []);
    return {
      passes: (targetType) => passing.includes(targetTypeRefKey(targetType)),
      absent: input.withheldOf(owner).length === 0 && ownerStates.every(state => state.kind === "none"),
    };
  }

  function decide(site: CsharpExpectedUseSite): SiteState {
    const owner = site.site.subject as Node;
    const forwardedDemands = site.demands.filter(demand => demand.forwardedFrom !== undefined);
    const state = forwardedDemands.length === 0 ? undefined : ownerState(owner);
    const forwarded = state === undefined ? [] : forwardedDemands.filter(demand =>
      state.passes(demand.forwardedFrom!) || state.absent && input.intrinsicTarget(owner, demand.forwardedFrom!));
    const direct = site.demands.filter(demand => demand.forwardedFrom === undefined);
    const chosen = forwarded.length > 0 ? forwarded : direct;
    if (chosen.length === 0) {
      return state !== undefined && !state.absent
        ? { kind: "pending", pending: Object.freeze({ reason: "owner-unresolved", owner }) } : noUse;
    }
    const byTarget = new Map<string, { readonly targetType: TargetTypeRef; readonly required: boolean }>();
    for (const demand of chosen) {
      const key = targetTypeRefKey(demand.targetType);
      byTarget.set(key, { targetType: demand.targetType, required: byTarget.get(key)?.required === true || demand.strength === "required" });
    }
    const candidates = byTarget.size > 1 ? [...byTarget.values()].filter(candidate => candidate.required) : [...byTarget.values()];
    if (candidates.length !== 1) {
      return { kind: "pending", pending: Object.freeze({ reason: "ambiguous-target",
        targets: Object.freeze([...byTarget.values()].map(candidate => candidate.targetType)) }) };
    }
    const { targetType, required } = candidates[0]!;
    const expression = chosen[0]!.expression;
    const shape = representation(expression, targetType);
    if ("pending" in shape) return { kind: "pending", pending: shape.pending };
    return { kind: "admitted", use: Object.freeze({
      expression,
      target: targetType,
      strength: required ? "required" : "contextual",
      representation: shape.representation,
      mode: "implicit",
      children: Object.freeze(shape.children),
    }) };
  }

  function representation(expression: Node, targetType: TargetTypeRef): Representation {
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
      return { pending: Object.freeze({ reason: "callable-creation", expression, target: targetType }) };
    }
    if (ast.is.IsArrayLiteralExpression(expression)) {
      return constructed(expression, targetType, ast.children(expression).flatMap((element, index) =>
        element === undefined ? [] : [csharpNativeUseSite(expression, { kind: "element", index })]));
    }
    if (ast.is.IsObjectLiteralExpression(expression)) {
      return constructed(expression, targetType, ast.children(expression).flatMap((member, index) => {
        const value = member === undefined ? undefined
          : ast.is.IsPropertyAssignment(member) ? ast.as.AsPropertyAssignment(member)?.Initializer
          : ast.is.IsShorthandPropertyAssignment(member) ? ast.name(member)
          : ast.is.IsSpreadAssignment(member) ? ast.as.AsSpreadAssignment(member)?.Expression : undefined;
        return value === undefined ? [] : [csharpNativeUseSite(expression, { kind: "member", index })];
      }));
    }
    return { representation: "convert", children: [] };
  }

  function constructed(expression: Node, targetType: TargetTypeRef, children: readonly TargetUseSiteRef[]): Representation {
    const carrier = input.constructionCarrier(expression, targetType);
    if (carrier === undefined) return { pending: Object.freeze({ reason: "construction-unresolved", expression, target: targetType }) };
    if (targetTypeRefKey(carrier) === targetTypeRefKey(targetType)) return { representation: "construct", children };
    return { pending: Object.freeze({ reason: "construction-conversion", expression, target: targetType, carrier,
      children: Object.freeze([...children]) }) };
  }
}

import type { Node } from "@tsonic/tsts";
import { isSourceCallableBodyBoundary } from "@tsonic/target-api/source";
import { targetUseSiteIdentity, type TargetUseSiteRef } from "@tsonic/target-api/analysis";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import { targetTypeRefKey } from "../../policy/types/index.js";
import { csharpNativeUseSite } from "../../target-model/records/native-demand.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpExpectedTypeIssue } from "../../target-model/records/expected-types.js";
import type {
  CsharpExpectedTypePending,
  CsharpExpectedTypeRecord,
  CsharpExpectedTypeStrength,
  CsharpExpectedTypeUse,
} from "./model.js";

const maximumExpectedTargetUses = 1_048_576;
const noExpectedTypes: readonly TargetTypeRef[] = Object.freeze([]);

export interface CsharpExpectedUseDemandEntry {
  readonly site: TargetUseSiteRef;
  readonly expression: Node;
  readonly targetType: TargetTypeRef;
  readonly strength: CsharpExpectedTypeStrength;
  readonly forwardedFrom?: TargetTypeRef;
}

export interface CsharpExpectedUseSite {
  readonly site: TargetUseSiteRef;
  readonly demands: readonly CsharpExpectedUseDemandEntry[];
}

export interface CsharpExpectedUseProjection {
  readonly targetTypes: readonly TargetTypeRef[];
  readonly expectedType: (expression: Node) => readonly TargetTypeRef[];
  readonly requiredExpectedType: (expression: Node) => readonly TargetTypeRef[];
  readonly storageExpectedType: (expression: Node) => readonly TargetTypeRef[];
  readonly exactIntegerConversion: (expression: Node, targetType: TargetTypeRef) => boolean;
  readonly sites: readonly CsharpExpectedUseSite[];
  readonly sitesOf: (expression: Node) => readonly CsharpExpectedUseSite[];
}

export interface CsharpExpectedUseCollection {
  readonly record: CsharpExpectedTypeRecord;
  readonly addTargetType: (targetType: TargetTypeRef) => void;
  readonly takePending: () => CsharpExpectedTypePending | undefined;
  readonly recordedUses: (expression: Node) => readonly CsharpExpectedTypeUse[];
  readonly contextualCallables: ReadonlySet<Node>;
  readonly issues: readonly CsharpExpectedTypeIssue[];
  readonly seal: () => CsharpExpectedUseProjection;
}

export function createCsharpExpectedUseCollection(policy: CsharpPolicyContext): CsharpExpectedUseCollection {
  const byExpression = new WeakMap<Node, Map<string, CsharpExpectedTypeUse>>();
  const expectedExpressions: Node[] = [];
  const targetTypes = new Map<string, TargetTypeRef>();
  const pending: CsharpExpectedTypePending[] = [];
  const issues: CsharpExpectedTypeIssue[] = [];
  const contextualCallables = new Set<Node>();
  const demandsBySubject = new WeakMap<object, Map<string, { readonly site: TargetUseSiteRef; readonly demands: Map<string, CsharpExpectedUseDemandEntry> }>>();
  const siteOrder: { readonly subject: object; readonly identity: string }[] = [];
  let expectedTargetUseCount = 0;
  let processedPending = 0;

  const record: CsharpExpectedTypeRecord = (expression, targetType, strength, demand, exactInteger = false) => {
    if (expression === undefined || targetType === undefined) {
      return;
    }
    if (isSourceCallableBodyBoundary(policy.ast, expression)) {
      contextualCallables.add(expression);
    }
    const key = targetTypeRefKey(targetType);
    let types = byExpression.get(expression);
    if (types === undefined) {
      types = new Map();
      byExpression.set(expression, types);
      expectedExpressions.push(expression);
    }
    const previous = types.get(key);
    const unchanged = (previous?.strength === "required" || previous?.strength === strength) &&
      (!exactInteger || previous.exactInteger);
    if (!unchanged) {
      if (previous === undefined) {
        expectedTargetUseCount += 1;
      }
      if (previous === undefined && expectedTargetUseCount > maximumExpectedTargetUses) {
        if (issues.length === 0) {
          issues.push(Object.freeze({
            node: expression,
            code: "CSHARP_EXPECTED_TARGET_USE_LIMIT_EXCEEDED",
            message:
              `C# expected-target analysis exceeds the ${maximumExpectedTargetUses}-use limit.`,
          }));
        }
        return;
      }
      targetTypes.set(key, targetType);
      const use = Object.freeze({ targetType, strength: previous?.strength === "required" ? "required" as const : strength,
        exactInteger: exactInteger || previous?.exactInteger === true });
      types.set(key, use);
      pending.push(Object.freeze({ expression, ...use }));
    }
    if (demand !== undefined) {
      recordDemand(csharpNativeUseSite(demand.owner, demand.slot), expression, targetType, key, strength, demand.forwardedFrom);
    }
  };

  return Object.freeze({
    record,
    addTargetType: (targetType: TargetTypeRef) => { targetTypes.set(targetTypeRefKey(targetType), targetType); },
    takePending: () => processedPending < pending.length ? pending[processedPending++] : undefined,
    recordedUses: (expression: Node) => [...(byExpression.get(expression)?.values() ?? [])],
    contextualCallables,
    issues,
    seal,
  });

  function recordDemand(
    site: TargetUseSiteRef,
    expression: Node,
    targetType: TargetTypeRef,
    targetKey: string,
    strength: CsharpExpectedTypeStrength,
    forwardedFrom: TargetTypeRef | undefined,
  ): void {
    const identity = targetUseSiteIdentity(site);
    let sites = demandsBySubject.get(site.subject);
    if (sites === undefined) {
      sites = new Map();
      demandsBySubject.set(site.subject, sites);
    }
    let entry = sites.get(identity);
    if (entry === undefined) {
      entry = { site, demands: new Map() };
      sites.set(identity, entry);
      siteOrder.push({ subject: site.subject, identity });
    }
    const demandKey = `${targetKey.length}:${targetKey}|${forwardedFrom === undefined ? "" : targetTypeRefKey(forwardedFrom)}`;
    const previous = entry.demands.get(demandKey);
    if (previous !== undefined && previous.expression !== expression) {
      throw new Error(`C# expected use '${site.role}' names two expressions.`);
    }
    if (previous?.strength === "required" || previous?.strength === strength) return;
    entry.demands.set(demandKey, Object.freeze({ site, expression, targetType, strength,
      ...(forwardedFrom === undefined ? {} : { forwardedFrom }) }));
  }

  function seal(): CsharpExpectedUseProjection {
    const expectedViews = new WeakMap<Node, {
      readonly all: readonly TargetTypeRef[];
      readonly required: readonly TargetTypeRef[];
      readonly storage: readonly TargetTypeRef[];
    }>();
    for (const expression of expectedExpressions) {
      const uses = [...(byExpression.get(expression)?.entries() ?? [])]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([, use]) => use);
      const all = Object.freeze(uses.map(use => use.targetType));
      const required = Object.freeze(uses.filter(use => use.strength === "required").map(use => use.targetType));
      expectedViews.set(expression, Object.freeze({ all, required, storage: required.length > 0 ? required : all }));
    }
    const sites: CsharpExpectedUseSite[] = [];
    const sitesByExpression = new Map<Node, CsharpExpectedUseSite[]>();
    for (const { subject, identity } of siteOrder) {
      const entry = demandsBySubject.get(subject)!.get(identity)!;
      const site = Object.freeze({ site: entry.site, demands: Object.freeze([...entry.demands.values()]) });
      sites.push(site);
      for (const expression of new Set(site.demands.map(demand => demand.expression))) {
        const list = sitesByExpression.get(expression) ?? [];
        list.push(site);
        sitesByExpression.set(expression, list);
      }
    }
    const frozenSites = Object.freeze(sites);
    const noSites: readonly CsharpExpectedUseSite[] = Object.freeze([]);
    const sitesOf = new Map([...sitesByExpression].map(([expression, list]) => [expression, Object.freeze(list)] as const));
    return Object.freeze({
      targetTypes: Object.freeze([...targetTypes.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([, type]) => type)),
      expectedType: (expression: Node) => expectedViews.get(expression)?.all ?? noExpectedTypes,
      requiredExpectedType: (expression: Node) => expectedViews.get(expression)?.required ?? noExpectedTypes,
      storageExpectedType: (expression: Node) => expectedViews.get(expression)?.storage ?? noExpectedTypes,
      exactIntegerConversion: (expression: Node, targetType: TargetTypeRef) =>
        byExpression.get(expression)?.get(targetTypeRefKey(targetType))?.exactInteger === true,
      sites: frozenSites,
      sitesOf: (expression: Node) => sitesOf.get(expression) ?? noSites,
    });
  }
}

import type { Node } from "@tsonic/tsts";
import { isSourceCallableBodyBoundary } from "@tsonic/target-api/source";
import { targetUseSiteIdentity, type TargetUseSiteRef } from "@tsonic/target-api/analysis";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import { targetTypeRefKey } from "../../target-model/types/equality.js";
import { csharpNativeUseSite } from "../../target-model/records/native/native-demand.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpExpectedTypeIssue, CsharpQuotationBindingSelection } from "../../target-model/records/types/expected-types.js";
import type { CsharpExpectedTypePending, CsharpExpectedTypeRecord, CsharpExpectedTypeUse, CsharpExpectedUseRequest } from "./model.js";

const maximumExpectedTargetUses = 1_048_576;
const noExpectedTypes: readonly TargetTypeRef[] = Object.freeze([]);

export interface CsharpExpectedUseProjection {
  readonly targetTypes: readonly TargetTypeRef[];
  readonly expectedType: (expression: Node) => readonly TargetTypeRef[];
  readonly requiredExpectedType: (expression: Node) => readonly TargetTypeRef[];
  readonly storageExpectedType: (expression: Node) => readonly TargetTypeRef[];
  readonly quotationBinding: (declaration: Node) => CsharpQuotationBindingSelection | undefined;
  readonly exactIntegerConversion: (expression: Node, targetType: TargetTypeRef) => boolean;
  readonly requests: readonly CsharpExpectedUseRequest[];
}

export interface CsharpExpectedUseCollection {
  readonly record: CsharpExpectedTypeRecord;
  readonly addTargetType: (targetType: TargetTypeRef) => void;
  readonly takePending: () => CsharpExpectedTypePending | undefined;
  readonly recordedUses: (expression: Node) => readonly CsharpExpectedTypeUse[];
  readonly recordQuotationBinding: (declaration: Node, initializer: Node, callable: Node, targetType: TargetTypeRef,
    argumentSite: TargetUseSiteRef) => void;
  readonly quotationBinding: (declaration: Node) => CsharpQuotationBindingSelection | undefined;
  readonly contextualCallables: ReadonlySet<Node>;
  readonly issues: readonly CsharpExpectedTypeIssue[];
  readonly seal: () => CsharpExpectedUseProjection;
}

interface SiteEntry {
  readonly site: TargetUseSiteRef;
  readonly requests: Map<TargetUseSiteRef | undefined, CsharpExpectedUseRequest>;
}

export function createCsharpExpectedUseCollection(policy: Pick<CsharpPolicyContext, "ast">): CsharpExpectedUseCollection {
  const byExpression = new WeakMap<Node, Map<string, CsharpExpectedTypeUse>>();
  const expectedExpressions: Node[] = [];
  const targetTypes = new Map<string, TargetTypeRef>();
  const issues: CsharpExpectedTypeIssue[] = [];
  const contextualCallables = new Set<Node>();
  const quotationBindings = new Map<Node, CsharpQuotationBindingSelection>();
  const bySubject = new WeakMap<object, Map<string, SiteEntry>>();
  const sites: SiteEntry[] = [];
  const pending: { readonly value: CsharpExpectedTypePending; readonly current: CsharpExpectedTypeUse | CsharpExpectedUseRequest;
    readonly entry?: SiteEntry; readonly parent?: TargetUseSiteRef }[] = [];
  let useCount = 0;
  let processed = 0;
  let sealed = false;

  const open = (): void => { if (sealed) failTargetAnalysisInvariant("tsonic-csharp", "Expected-use collection is sealed."); };
  const siteEntry = (site: TargetUseSiteRef): SiteEntry => {
    let entries = bySubject.get(site.subject);
    if (entries === undefined) { entries = new Map(); bySubject.set(site.subject, entries); }
    const identity = targetUseSiteIdentity(site);
    let entry = entries.get(identity);
    if (entry === undefined) {
      entry = { site, requests: new Map() };
      entries.set(identity, entry);
      sites.push(entry);
    }
    return entry;
  };

  const record: CsharpExpectedTypeRecord = (expression, targetType, strength, demand, exactInteger = false) => {
    open();
    let use: CsharpExpectedTypeUse | undefined;
    let changed = false;
    if (expression !== undefined && targetType !== undefined) {
      if (isSourceCallableBodyBoundary(policy.ast, expression)) contextualCallables.add(expression);
      const key = targetTypeRefKey(targetType);
      let types = byExpression.get(expression);
      if (types === undefined) { types = new Map(); byExpression.set(expression, types); expectedExpressions.push(expression); }
      const previous = types.get(key);
      changed = !(previous !== undefined && (previous.strength === "required" || previous.strength === strength) &&
        (!exactInteger || previous.exactInteger));
      if (changed) {
        if (previous === undefined && ++useCount > maximumExpectedTargetUses) {
          if (issues.length === 0) issues.push(Object.freeze({ node: expression, code: "CSHARP_EXPECTED_TARGET_USE_LIMIT_EXCEEDED",
            message: `C# expected-target analysis exceeds the ${maximumExpectedTargetUses}-use limit.` }));
        } else {
          targetTypes.set(key, targetType);
          use = Object.freeze({ targetType, strength: previous?.strength === "required" ? "required" : strength,
            exactInteger: exactInteger || previous?.exactInteger === true });
          types.set(key, use);
        }
      }
    }
    let request: CsharpExpectedUseRequest | undefined;
    if (demand !== undefined) {
      const mode = demand.mode ?? "implicit";
      const entry = siteEntry(csharpNativeUseSite(demand.owner, demand.slot, { target: targetType, mode }));
      const parent = demand.forwardedFrom === undefined ? undefined : siteEntry(demand.forwardedFrom).site;
      const previous = entry.requests.get(parent);
      const reason = demand.withheld ?? (expression === undefined ? "expression-unresolved" : targetType === undefined ? "target-unresolved" : undefined);
      if (previous !== undefined && previous.expression !== expression) {
        failTargetAnalysisInvariant("tsonic-csharp", "One exact expected-use site names different expressions.", demand.owner);
      }
      if (previous === undefined || previous.strength !== "required" && strength === "required" ||
        exactInteger && !previous.exactInteger || previous.kind === "pending" &&
          (reason === undefined || previous.reason !== reason)) {
        const base = { site: entry.site, mode, strength: previous?.strength === "required" ? "required" as const : strength,
          exactInteger: exactInteger || previous?.exactInteger === true, ...(parent === undefined ? {} : { forwardedFrom: parent }) };
        request = expression !== undefined && targetType !== undefined && reason === undefined
          ? Object.freeze({ ...base, kind: "requested", expression, targetType })
          : Object.freeze({ ...base, kind: "pending", reason: reason ?? "operation",
            ...(expression === undefined ? {} : { expression }), ...(targetType === undefined ? {} : { targetType }) });
        entry.requests.set(parent, request);
        if (request.kind === "requested") pending.push({ value: Object.freeze({ expression: request.expression,
          targetType: request.targetType, strength: request.strength, exactInteger: request.exactInteger, site: entry.site, mode: request.mode }),
          current: request, entry, ...(parent === undefined ? {} : { parent }) });
      }
    }
    if (changed && use !== undefined && expression !== undefined && (demand === undefined || request?.kind === "pending")) {
      pending.push({ value: Object.freeze({ expression, ...use }), current: use });
    }
  };

  return Object.freeze({ record, contextualCallables, issues,
    addTargetType(targetType: TargetTypeRef) { open(); targetTypes.set(targetTypeRefKey(targetType), targetType); },
    recordedUses: (expression: Node) => [...(byExpression.get(expression)?.values() ?? [])],
    recordQuotationBinding(declaration: Node, initializer: Node, callable: Node, targetType: TargetTypeRef,
      argumentSite: TargetUseSiteRef) {
      open();
      const previous = quotationBindings.get(declaration);
      if (previous !== undefined && (previous.initializer !== initializer || previous.callable !== callable)) {
        failTargetAnalysisInvariant("tsonic-csharp", "One quotation binding names different original creation nodes.", declaration);
      }
      const site = siteEntry(argumentSite).site;
      const argumentSites = previous?.argumentSites.includes(site) === true ? previous.argumentSites
        : Object.freeze([...(previous?.argumentSites ?? []), site]);
      const targets = new Map((previous === undefined ? [] : previous.kind === "selected" ? [previous.targetType] : previous.targetTypes)
        .map(selected => [targetTypeRefKey(selected), selected]));
      const key = targetTypeRefKey(targetType);
      if (!targets.has(key)) targets.set(key, targetType);
      const identity = { declaration, initializer, callable, argumentSites };
      quotationBindings.set(declaration, targets.size === 1
        ? Object.freeze({ ...identity, kind: "selected", targetType: targets.get(key)! })
        : Object.freeze({ ...identity, kind: "conflicting", targetTypes: Object.freeze([...targets.values()]) }));
      if (targets.size > 1 && previous?.kind !== "conflicting") issues.push(Object.freeze({
        node: declaration, code: "CSHARP_QUOTATION_BINDING_CONFLICT",
        message: "One immutable quotation binding requires incompatible native Expression carriers.",
      }));
    },
    quotationBinding: (declaration: Node) => quotationBindings.get(declaration),
    takePending() {
      open();
      while (processed < pending.length) {
        const entry = pending[processed++]!;
        const current = entry.entry === undefined
          ? byExpression.get(entry.value.expression)?.get(targetTypeRefKey(entry.value.targetType))
          : entry.entry.requests.get(entry.parent);
        if (current === entry.current) return entry.value;
      }
      return undefined;
    },
    seal() {
      open();
      sealed = true;
      const views = new WeakMap<Node, { readonly all: readonly TargetTypeRef[]; readonly required: readonly TargetTypeRef[];
        readonly storage: readonly TargetTypeRef[] }>();
      for (const expression of expectedExpressions) {
        const uses = [...(byExpression.get(expression)?.entries() ?? [])].sort(([left], [right]) => left.localeCompare(right)).map(([, value]) => value);
        const all = Object.freeze(uses.map(value => value.targetType));
        const required = Object.freeze(uses.filter(value => value.strength === "required").map(value => value.targetType));
        views.set(expression, Object.freeze({ all, required, storage: required.length > 0 ? required : all }));
      }
      Object.freeze(issues);
      return Object.freeze({ targetTypes: Object.freeze([...targetTypes.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, value]) => value)),
        expectedType: (expression: Node) => views.get(expression)?.all ?? noExpectedTypes,
        requiredExpectedType: (expression: Node) => views.get(expression)?.required ?? noExpectedTypes,
        storageExpectedType: (expression: Node) => views.get(expression)?.storage ?? noExpectedTypes,
        quotationBinding: (declaration: Node) => quotationBindings.get(declaration),
        exactIntegerConversion: (expression: Node, targetType: TargetTypeRef) => byExpression.get(expression)?.get(targetTypeRefKey(targetType))?.exactInteger === true,
        requests: Object.freeze(sites.flatMap(entry => [...entry.requests.values()])),
      });
    },
  });
}

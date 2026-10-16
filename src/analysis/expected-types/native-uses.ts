import type { Node } from "@tsonic/tsts";
import { targetUseSiteIdentity, type TargetUseSiteRef } from "@tsonic/target-api/analysis";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { selectCsharpNativeUseRepresentation, type CsharpNativeRepresentationChild } from "../../policy/conversions/native-use-representation.js";
import type { CsharpExpectedNativeUse } from "../../target-model/records/native-demand.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import type { CsharpExpectedNativeUseAdmission, CsharpExpectedNativeUseFinalInput, CsharpExpectedNativeUsePendingReason,
  CsharpExpectedTypeAnalysis, CsharpExpectedUseRequest } from "./model.js";

export interface CsharpExpectedNativeUseSites {
  readonly requests: readonly CsharpExpectedUseRequest[];
  readonly pending: readonly Extract<CsharpExpectedUseRequest, { readonly kind: "pending" }>[];
  readonly get: (site: TargetUseSiteRef) => readonly CsharpExpectedUseRequest[];
  readonly requestsOf: (expression: Node) => readonly CsharpExpectedUseRequest[];
}

type AdmissionState =
  | { readonly kind: "admitted"; readonly use: CsharpExpectedNativeUse; readonly children: ReadonlySet<AdmissionGroup> }
  | { readonly kind: "pending"; readonly reason: CsharpExpectedNativeUsePendingReason }
  | { readonly kind: "inactive" };

interface AdmissionGroup {
  readonly site: TargetUseSiteRef;
  readonly requests: CsharpExpectedUseRequest[];
  readonly parents: Set<AdmissionGroup>;
  readonly dependents: Set<AdmissionGroup>;
  readonly childData: Map<string, CsharpNativeRepresentationChild>;
  readonly childGroups: Map<string, AdmissionGroup>;
  missingParent: boolean;
  remaining: number;
  state?: AdmissionState;
}

export function admitCsharpExpectedNativeUses(
  expected: CsharpExpectedTypeAnalysis,
  final: CsharpExpectedNativeUseFinalInput,
): CsharpExpectedNativeUseAdmission {
  const subjects = new Map<object, Map<string, AdmissionGroup>>();
  const groups: AdmissionGroup[] = [];
  const groupOf = (site: TargetUseSiteRef): AdmissionGroup | undefined => subjects.get(site.subject)?.get(targetUseSiteIdentity(site));
  for (const request of expected.nativeUseSites.requests) {
    let sites = subjects.get(request.site.subject);
    if (sites === undefined) { sites = new Map(); subjects.set(request.site.subject, sites); }
    const identity = targetUseSiteIdentity(request.site);
    let group = sites.get(identity);
    if (group === undefined) {
      group = { site: request.site, requests: [], parents: new Set(), dependents: new Set(), childData: new Map(),
        childGroups: new Map(), missingParent: false, remaining: 0 };
      sites.set(identity, group);
      groups.push(group);
    }
    group.requests.push(request);
  }
  for (const group of groups) for (const request of group.requests) {
    if (request.forwardedFrom === undefined) continue;
    const parent = groupOf(request.forwardedFrom);
    if (parent === undefined) { group.missingParent = true; continue; }
    group.parents.add(parent);
    parent.dependents.add(group);
    const identity = targetUseSiteIdentity(group.site);
    parent.childData.set(identity, Object.freeze({ site: group.site, expression: request.expression, target: request.targetType }));
    parent.childGroups.set(identity, group);
  }
  const queue: AdmissionGroup[] = [];
  for (const group of groups) {
    group.remaining = group.parents.size;
    if (group.remaining === 0) queue.push(group);
  }
  for (let index = 0; index < queue.length; index += 1) {
    const group = queue[index]!;
    group.state = decide(group);
    for (const dependent of group.dependents) {
      dependent.remaining -= 1;
      if (dependent.remaining === 0) queue.push(dependent);
    }
  }
  const entries: { readonly site: TargetUseSiteRef; readonly use: CsharpExpectedNativeUse }[] = [];
  const pending: { readonly site: TargetUseSiteRef; readonly reason: CsharpExpectedNativeUsePendingReason }[] = [];
  const inactive: TargetUseSiteRef[] = [];
  const stages = new Map<object, Map<string, CsharpExpectedNativeUse>>();
  const stagePositions = new Map<CsharpExpectedNativeUse, number>();
  for (const group of groups) {
    const state = group.state ?? { kind: "pending", reason: "forwarding-cycle" };
    if (state.kind === "pending") { pending.push(Object.freeze({ site: group.site, reason: state.reason })); continue; }
    if (state.kind === "inactive") { inactive.push(group.site); continue; }
    entries.push(Object.freeze({ site: group.site, use: state.use }));
    const stage = state.use.construction;
    if (stage === undefined) continue;
    let sites = stages.get(stage.site.subject);
    if (sites === undefined) { sites = new Map(); stages.set(stage.site.subject, sites); }
    const identity = targetUseSiteIdentity(stage.site);
    const use = Object.freeze({ ...state.use, target: stage.carrier, carrier: stage.carrier, representation: "construct" as const,
      children: stage.children, construction: undefined });
    const existing = sites.get(identity);
    if (existing !== undefined) {
      if (!targetTypeRefEquals(existing.carrier, use.carrier) || existing.children.length !== use.children.length ||
        existing.children.some((child, index) => child.subject !== use.children[index]!.subject ||
          targetUseSiteIdentity(child) !== targetUseSiteIdentity(use.children[index]!))) {
        failTargetAnalysisInvariant("tsonic-csharp", "A physical construction site requires one finalized carrier and child set.", use.expression);
      }
      const merged = Object.freeze({ ...use, strength: existing.strength === "required" || use.strength === "required" ? "required" as const : "contextual" as const,
        exactInteger: existing.exactInteger || use.exactInteger });
      const position = stagePositions.get(existing)!;
      entries[position] = Object.freeze({ site: stage.site, use: merged });
      sites.set(identity, merged);
      stagePositions.delete(existing); stagePositions.set(merged, position);
      continue;
    }
    sites.set(identity, use);
    stagePositions.set(use, entries.length);
    entries.push(Object.freeze({ site: stage.site, use }));
  }
  const uses = new Map<object, Map<string, CsharpExpectedNativeUse>>();
  for (const entry of entries) {
    const sites = uses.get(entry.site.subject) ?? new Map();
    const identity = targetUseSiteIdentity(entry.site);
    if (sites.has(identity)) failTargetAnalysisInvariant("tsonic-csharp", "A native representation site is published twice.", entry.use.expression);
    sites.set(identity, entry.use); uses.set(entry.site.subject, sites);
  }
  return Object.freeze({ entries: Object.freeze(entries), pending: Object.freeze(pending), inactive: Object.freeze(inactive),
    expectedUse: Object.freeze({ get: (site: TargetUseSiteRef) => uses.get(site.subject)?.get(targetUseSiteIdentity(site)) }) });

  function decide(group: AdmissionGroup): AdmissionState {
    const active: CsharpExpectedUseRequest[] = [];
    let unresolved = group.missingParent;
    for (const request of group.requests) {
      if (request.forwardedFrom === undefined) { active.push(request); continue; }
      const parent = groupOf(request.forwardedFrom);
      if (parent?.state?.kind === "admitted" && parent.state.children.has(group)) active.push(request);
      else if (parent?.state?.kind === "pending" || parent?.state === undefined) unresolved = true;
    }
    if (active.length === 0) return unresolved ? { kind: "pending", reason: "forwarding-owner-unresolved" } : { kind: "inactive" };
    const request = active[0]!;
    if (request.kind === "pending") return { kind: "pending", reason: request.reason };
    for (const other of active) {
      if (other.kind === "pending") return { kind: "pending", reason: other.reason };
      if (other.expression !== request.expression || !targetTypeRefEquals(other.targetType, request.targetType) || other.mode !== request.mode) {
        return { kind: "pending", reason: "inconsistent-request" };
      }
    }
    const selection = selectCsharpNativeUseRepresentation({ ast: final.ast, expression: request.expression, target: request.targetType,
      mode: request.mode, source: final.valueRead.get(request.expression)?.value, absent: final.absentValue.get(request.expression),
      literal: final.exactLiteral.get(request.expression, request.targetType), callable: final.callableCreation.get(request.expression),
      constructionCarrier: expected.constructions.constructionCarrier(request.expression, request.targetType),
      binary: expected.expectedBinary.get(request.expression, request.targetType) ?? final.operations.binaryOperation.get(request.expression)?.target,
      children: group.childData });
    if (selection.kind === "pending") return selection;
    const forwarded = selection.construction?.children ?? selection.children;
    const children = new Set<AdmissionGroup>();
    for (const site of forwarded) {
      const child = group.childGroups.get(targetUseSiteIdentity(site));
      if (child !== undefined && child.site.subject === site.subject) children.add(child);
    }
    const use: CsharpExpectedNativeUse = Object.freeze({ expression: request.expression, target: request.targetType, carrier: selection.carrier,
      representation: selection.representation, children: selection.children, construction: selection.construction, mode: request.mode,
      strength: active.some(entry => entry.strength === "required") ? "required" : "contextual", exactInteger: active.some(entry => entry.exactInteger) });
    return { kind: "admitted", use, children };
  }
}

export function collectCsharpExpectedNativeUseSites(requests: readonly CsharpExpectedUseRequest[]): CsharpExpectedNativeUseSites {
  const bySubject = new Map<object, Map<string, CsharpExpectedUseRequest[]>>();
  const byExpression = new Map<Node, CsharpExpectedUseRequest[]>();
  const pending: Extract<CsharpExpectedUseRequest, { readonly kind: "pending" }>[] = [];
  for (const request of requests) {
    let sites = bySubject.get(request.site.subject);
    if (sites === undefined) { sites = new Map(); bySubject.set(request.site.subject, sites); }
    const identity = targetUseSiteIdentity(request.site);
    const site = sites.get(identity) ?? [];
    site.push(request);
    sites.set(identity, site);
    if (request.expression !== undefined) {
      const uses = byExpression.get(request.expression) ?? [];
      uses.push(request);
      byExpression.set(request.expression, uses);
    }
    if (request.kind === "pending") pending.push(request);
  }
  const noRequests: readonly CsharpExpectedUseRequest[] = Object.freeze([]);
  for (const sites of bySubject.values()) for (const values of sites.values()) Object.freeze(values);
  for (const values of byExpression.values()) Object.freeze(values);
  return Object.freeze({ requests: Object.freeze([...requests]), pending: Object.freeze(pending),
    get: (site: TargetUseSiteRef) => bySubject.get(site.subject)?.get(targetUseSiteIdentity(site)) ?? noRequests,
    requestsOf: (expression: Node) => byExpression.get(expression) ?? noRequests });
}

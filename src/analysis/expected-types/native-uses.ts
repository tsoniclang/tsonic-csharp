import type { Node } from "@tsonic/tsts";
import { targetUseSiteIdentity, type TargetUseSiteRef } from "@tsonic/target-api/analysis";
import type { CsharpExpectedUseRequest } from "./model.js";

export interface CsharpExpectedNativeUseSites {
  readonly requests: readonly CsharpExpectedUseRequest[];
  readonly pending: readonly Extract<CsharpExpectedUseRequest, { readonly kind: "pending" }>[];
  readonly get: (site: TargetUseSiteRef) => readonly CsharpExpectedUseRequest[];
  readonly requestsOf: (expression: Node) => readonly CsharpExpectedUseRequest[];
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

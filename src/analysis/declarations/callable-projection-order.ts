import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpBodyCallSource } from "../operations/body-inputs.js";
import type { CsharpTypeProjectionOwnerSource, CsharpTypeProjectionSource } from "./type-projection-source.js";
import type { CsharpNodeQuerySource } from "../source-evidence/types/resolution/root-sources.js";
import type { CsharpObjectMethodImplementationSource } from "../objects/shapes/method-implementations.js";
import type { CsharpCapturedBodySource } from "../source-evidence/model.js";
import type { CsharpDeclaredProjectSelfBody } from "../source-evidence/types/resolution/declared-project-self.js";
import { csharpDeclaredStructuralBodySource } from "../source-evidence/types/resolution/declared-structural-body.js";

export type CsharpCallableProjectionDependency = {
  readonly caller: CsharpTypeProjectionOwnerSource;
  readonly callee: CsharpTypeProjectionOwnerSource;
} & (
  | { readonly kind: "call"; readonly call: CsharpBodyCallSource }
  | { readonly kind: "capture"; readonly source: CsharpNodeQuerySource;
      readonly capture: CsharpObjectMethodImplementationSource["captures"][number] }
  | { readonly kind: "project-self"; readonly body: Extract<CsharpDeclaredProjectSelfBody, { readonly phase: "declared" }> }
);

export interface CsharpCallableProjectionComponent {
  readonly owners: readonly CsharpTypeProjectionOwnerSource[];
  readonly dependencies: readonly CsharpCallableProjectionDependency[];
  readonly recursive: boolean;
}

export function formCsharpCallableProjectionOrder(
  source: CsharpTypeProjectionSource,
  calls: ReadonlyMap<CsharpTypeProjectionOwnerSource, readonly CsharpBodyCallSource[]>,
  bodies: ReadonlyMap<CsharpTypeProjectionOwnerSource, readonly CsharpCapturedBodySource[]>,
): readonly CsharpCallableProjectionComponent[] {
  const dependencies = new Map<CsharpTypeProjectionOwnerSource, readonly CsharpCallableProjectionDependency[]>();
  for (const owner of source.owners) {
    if (source.ownerFor(owner.declaration) !== owner) return failTargetAnalysisInvariant("tsonic-csharp",
      "A call-graph publication requires its original callable body owner.", owner.declaration);
    const nodes = new Set(owner.nodes.map(occurrence => occurrence.node));
    const selected: CsharpCallableProjectionDependency[] = [];
    for (const call of calls.get(owner) ?? []) {
      if (!nodes.has(call.node) || call.source !== undefined && call.source.call !== call.node) {
        return failTargetAnalysisInvariant("tsonic-csharp",
          "A callable publication dependency requires its actual selected body call.", call.node);
      }
      const declaration = call.declarationSource?.owner;
      const callee = declaration === undefined ? undefined : source.ownerFor(declaration);
      if (callee !== undefined) selected.push(Object.freeze({ kind: "call", caller: owner, callee, call }));
    }
    for (const captured of bodies.get(owner) ?? []) {
      const input = captured.source;
      if (input.node === undefined || !nodes.has(input.node)) return failTargetAnalysisInvariant("tsonic-csharp",
        "A capture dependency requires its original structural-body occurrence.", owner.declaration);
      const structural = csharpDeclaredStructuralBodySource(input);
      for (const capture of structural?.implementation?.captures ?? []) {
        const callee = source.ownerFor(capture.declaration);
        if (callee !== undefined) selected.push(Object.freeze({ kind: "capture", caller: owner, callee, source: input, capture }));
      }
      const body = captured.projectSelf;
      if (body !== undefined) {
        if (body.source !== input || input.root.kind !== "node" || input.root.projectInstance !== body.self ||
          body.self.declaration !== body.declaration.declaration) return failTargetAnalysisInvariant("tsonic-csharp",
            "A class-self dependency requires its retained non-static instance record.", input.node);
        const callee = source.ownerFor(body.self.declaration);
        if (callee !== undefined) selected.push(Object.freeze({ kind: "project-self", caller: owner, callee, body }));
      }
    }
    dependencies.set(owner, Object.freeze(selected));
  }
  const indices = new Map<CsharpTypeProjectionOwnerSource, number>();
  const roots = new Map<CsharpTypeProjectionOwnerSource, number>();
  const active: CsharpTypeProjectionOwnerSource[] = [];
  const pending = new Set<CsharpTypeProjectionOwnerSource>();
  const sourceOrder = new Map(source.owners.map((owner, index) => [owner, index]));
  const components: CsharpCallableProjectionComponent[] = [];
  const frames: { readonly owner: CsharpTypeProjectionOwnerSource;
    readonly parent: CsharpTypeProjectionOwnerSource | undefined; next: number }[] = [];
  const enter = (owner: CsharpTypeProjectionOwnerSource, parent: CsharpTypeProjectionOwnerSource | undefined): void => {
    const index = indices.size;
    indices.set(owner, index);
    roots.set(owner, index);
    active.push(owner);
    pending.add(owner);
    frames.push({ owner, parent, next: 0 });
  };
  for (const owner of source.owners) {
    if (indices.has(owner)) continue;
    enter(owner, undefined);
    while (frames.length !== 0) {
      const frame = frames[frames.length - 1]!;
      const selected = dependencies.get(frame.owner)!;
      if (frame.next < selected.length) {
        const { callee } = selected[frame.next++]!;
        if (!indices.has(callee)) enter(callee, frame.owner);
        else if (pending.has(callee)) roots.set(frame.owner, Math.min(roots.get(frame.owner)!, indices.get(callee)!));
        continue;
      }
      frames.pop();
      if (roots.get(frame.owner) === indices.get(frame.owner)) {
        const members = new Set<CsharpTypeProjectionOwnerSource>();
        const owners: CsharpTypeProjectionOwnerSource[] = [];
        for (;;) {
          const member = active.pop();
          if (member === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
            "A callable dependency component requires its original active owners.", frame.owner.declaration);
          pending.delete(member);
          members.add(member);
          owners.push(member);
          if (member === frame.owner) break;
        }
        owners.sort((left, right) => sourceOrder.get(left)! - sourceOrder.get(right)!);
        const internal = owners.flatMap(owner => dependencies.get(owner)!.filter(edge => members.has(edge.callee)));
        components.push(Object.freeze({ owners: Object.freeze(owners), dependencies: Object.freeze(internal),
          recursive: owners.length > 1 || internal.some(edge => edge.caller === edge.callee) }));
      }
      if (frame.parent !== undefined) roots.set(frame.parent, Math.min(roots.get(frame.parent)!, roots.get(frame.owner)!));
    }
  }
  return Object.freeze(components);
}

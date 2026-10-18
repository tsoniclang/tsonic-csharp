import type { Node } from "@tsonic/tsts";
import { createSourceControlFlow, solveSourceFlow } from "@tsonic/target-api/analysis";
import type { TargetSourceProgram } from "@tsonic/target-api/source";
import type { CsharpNativeDemandAnalysis } from "../operations/native-demand-model.js";
import type { CsharpNativeUse } from "../../target-model/records/native-demand.js";
import { isCsharpRefLikeTargetType } from "../../target-model/types/ref-like.js";

type Rejection = (node: Node, code: string, message: string) => void;

export function analyzeCsharpRefLikeLiveness(source: TargetSourceProgram, declaration: Node,
  ownedBindings: ReadonlySet<Node>, reject: Rejection): void {
  const selected = createSourceControlFlow(source, declaration, { domain: { kind: "source" } });
  if (selected.kind === "unresolved") {
    reject(declaration, "CSHARP_REFLIKE_LIVENESS_NOT_PROVEN", selected.reason);
    return;
  }
  for (const binding of ownedBindings) if (!selected.graph.bindings.has(binding)) reject(binding,
    "CSHARP_REFLIKE_LIVENESS_NOT_PROVEN", "The exact native ref-like binding is absent from its checked control-flow graph.");
  const live = solveSourceFlow<ReadonlySet<Node>>(selected.graph, {
    direction: "backward",
    lattice: {
      empty: () => new Set<Node>(),
      join(left, right, work) {
        const result = new Set(left);
        for (const value of right) { work.step(); result.add(value); }
        return result;
      },
      equals: (left, right, work) => left.size === right.size && [...left].every(value => { work.step(); return right.has(value); }),
    },
    transfer(point, state, work) {
      work.step();
      const operation = point.operation;
      if (!("binding" in operation) || !ownedBindings.has(operation.binding)) return state;
      const result = new Set(state);
      if (operation.kind === "read" || operation.kind === "capture") result.add(operation.binding);
      else result.delete(operation.binding);
      return result;
    },
  });
  if (live.kind === "unresolved") { reject(declaration, "CSHARP_REFLIKE_LIVENESS_NOT_PROVEN", live.reason); return; }
  for (const point of selected.graph.points) {
    if (!live.reachable.has(point.id) || point.operation.kind !== "await" && point.operation.kind !== "yield") continue;
    const values = live.after.get(point.id);
    if (values === undefined) {
      reject(declaration, "CSHARP_REFLIKE_LIVENESS_NOT_PROVEN", "A reachable native suspension has no completed liveness proof.");
      continue;
    }
    for (const binding of values) reject(binding, "CSHARP_REFLIKE_ACROSS_SUSPENSION",
      "A native ref-like value cannot remain live across an await or yield suspension.");
  }
}

export function analyzeCsharpRefLikeEvaluation(source: TargetSourceProgram, demand: CsharpNativeDemandAnalysis,
  reject: Rejection): void {
  const suspended = new Map<CsharpNativeUse, boolean>();
  const active = new Set<CsharpNativeUse>();
  const resolvedChildren = new Map<CsharpNativeUse, readonly CsharpNativeUse[]>();
  const pending: { readonly use: CsharpNativeUse; readonly leaving: boolean }[] = [];
  const children = (use: CsharpNativeUse): readonly CsharpNativeUse[] | undefined => {
    if (use.kind === "erased") return [];
    const result: CsharpNativeUse[] = [];
    const sites = use.evaluation.kind === "sequence" ? use.evaluation.steps.map(step => step.site)
      : use.evaluation.kind === "conditional" ? [use.evaluation.condition, use.evaluation.whenTrue, use.evaluation.whenFalse]
        : use.evaluation.kind === "short-circuit" ? [use.evaluation.left, use.evaluation.right] : use.children;
    for (const site of sites) {
      const child = demand.nativeUse.get(site);
      if (child === undefined) return undefined;
      result.push(child);
    }
    return result;
  };
  for (const entry of demand.entries) {
    pending.push({ use: entry.use, leaving: false });
    while (pending.length > 0) {
      const current = pending.pop()!;
      const use = current.use;
      if (suspended.has(use)) continue;
      if (!current.leaving) {
        if (active.has(use)) {
          reject(use.expression, "CSHARP_REFLIKE_LIVENESS_NOT_PROVEN", "Native evaluation liveness requires an acyclic admitted consumption graph.");
          continue;
        }
        if (use.kind === "erased") { suspended.set(use, false); continue; }
        const selected = children(use);
        if (selected === undefined) {
          reject(use.expression, "CSHARP_REFLIKE_LIVENESS_NOT_PROVEN", "Native evaluation liveness requires every admitted child use.");
          continue;
        }
        active.add(use);
        resolvedChildren.set(use, selected);
        pending.push({ use, leaving: true });
        for (let index = selected.length - 1; index >= 0; index -= 1) pending.push({ use: selected[index]!, leaving: false });
        continue;
      }
      active.delete(use);
      if (use.kind === "erased") { suspended.set(use, false); continue; }
      const selected = resolvedChildren.get(use)!;
      if (selected.some(child => !suspended.has(child))) {
        reject(use.expression, "CSHARP_REFLIKE_LIVENESS_NOT_PROVEN", "Native evaluation liveness did not complete every selected child.");
        continue;
      }
      if (use.evaluation.kind === "sequence" || use.evaluation.kind === "creation") {
        const retained: Node[] = [];
        for (const child of selected) {
          if (suspended.get(child)) {
            for (const value of retained) reject(value, "CSHARP_REFLIKE_ACROSS_SUSPENSION",
              "A native ref-like operand, receiver or argument cannot be retained across a later suspension in the same expression.");
            retained.length = 0;
          }
          if (child.kind !== "erased" && child.completion.kind === "value" && isCsharpRefLikeTargetType(child.completion.type)) retained.push(child.expression);
        }
      }
      suspended.set(use, source.ast.is.IsAwaitExpression(use.expression) || source.ast.is.IsYieldExpression(use.expression) ||
        selected.some(child => suspended.get(child) === true));
    }
  }
}

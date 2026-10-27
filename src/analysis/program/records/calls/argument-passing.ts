import type { Node } from "@tsonic/tsts";
import type { CsharpTargetParameter } from "../../../../target-model/types/model.js";
import type { CsharpArgumentPassing, CsharpArgumentPassingRecords } from "../../../../target-model/records/calls/argument-passing.js";

export function createCsharpArgumentPassingRecords(input: { readonly passing: ReadonlyMap<Node, CsharpArgumentPassing>;
  readonly projections: ReadonlyMap<Node, ReadonlyMap<CsharpTargetParameter, boolean>> }): CsharpArgumentPassingRecords {
  const passing = new WeakMap<Node, CsharpArgumentPassing>();
  const projections = new WeakMap<Node, ReadonlyMap<CsharpTargetParameter, boolean>>();
  for (const [node, value] of input.passing) passing.set(node, Object.freeze(value));
  for (const [node, values] of input.projections) projections.set(node, new Map(values));
  return Object.freeze({ argumentPassing: Object.freeze({ get: (node: Node) => passing.get(node) }),
    argumentProjection: Object.freeze({ get: (node: Node, parameter: CsharpTargetParameter) => projections.get(node)?.get(parameter) }) });
}

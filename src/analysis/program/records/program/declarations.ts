import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpDeclarationClassifications, CsharpDefaultParameterContract, CsharpReturnTargetContract } from "../../../../target-model/records/program/declarations.js";

type CsharpMethodWrite = NonNullable<ReturnType<CsharpDeclarationClassifications["methodWrite"]["get"]>>;

export function createCsharpDeclarationProducer() {
  const returns = new WeakMap<Node, CsharpReturnTargetContract>();
  const defaults = new WeakMap<Node, CsharpDefaultParameterContract>();
  const writes = new WeakMap<Node, CsharpMethodWrite>();
  let closed = false;
  const publish = <Value extends object>(map: WeakMap<Node, Value>, node: Node, value: Value): void => {
    if (closed || map.has(node)) failTargetAnalysisInvariant("tsonic-csharp", "A native declaration fact publishes once before sealing.", node);
    map.set(node, Object.freeze(value));
  };
  const records: CsharpDeclarationClassifications = Object.freeze({
    runtimeDefault: Object.freeze({ get: (node: Node) => defaults.get(node) }),
    methodWrite: Object.freeze({ get: (node: Node) => writes.get(node) }),
    returnContract: Object.freeze({ get: (node: Node) => returns.get(node) }),
  });
  return Object.freeze({ records,
    runtimeDefault: (node: Node, value: CsharpDefaultParameterContract): void => publish(defaults, node, value),
    methodWrite: (node: Node, value: CsharpMethodWrite): void => publish(writes, node, value),
    returnContract: (node: Node, value: CsharpReturnTargetContract): void => publish(returns, node, value),
    seal(): CsharpDeclarationClassifications {
      if (closed) failTargetAnalysisInvariant("tsonic-csharp", "Native declaration records seal once.");
      closed = true;
      return records;
    },
  });
}

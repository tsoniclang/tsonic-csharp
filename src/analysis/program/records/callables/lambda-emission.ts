import type { Node } from "@tsonic/tsts";
import type { CsharpLambdaBodyEmission, CsharpLambdaEmissionRecords } from "../../../../target-model/records/callables/lambda-emission.js";

export function createCsharpLambdaEmissionRecords(entries: ReadonlyMap<Node, CsharpLambdaBodyEmission>): CsharpLambdaEmissionRecords {
  const values = new WeakMap<Node, CsharpLambdaBodyEmission>();
  for (const [node, value] of entries) values.set(node, Object.freeze(value));
  return Object.freeze({ lambdaBody: Object.freeze({ get: (node: Node) => values.get(node) }) });
}

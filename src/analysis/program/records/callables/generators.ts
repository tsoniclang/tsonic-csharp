import type { Node } from "@tsonic/tsts";
import type { CsharpGeneratorFact, CsharpGeneratorRecords, CsharpYieldFact } from "../../../../target-model/records/callables/generators.js";

export function createCsharpGeneratorRecords(
  generators: ReadonlyMap<Node, CsharpGeneratorFact>, yields: ReadonlyMap<Node, CsharpYieldFact>,
): CsharpGeneratorRecords {
  return Object.freeze({
    generator: Object.freeze({ get: (subject: Node | undefined) => subject === undefined ? undefined : generators.get(subject) }),
    yield: Object.freeze({ get: (subject: Node | undefined) => subject === undefined ? undefined : yields.get(subject) }),
  });
}

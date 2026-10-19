import type { Node } from "@tsonic/tsts";
import type { CsharpClassFieldInitialization, CsharpClassFieldInitializationRecords } from "../../../target-model/records/class-initialization.js";

export function createCsharpClassFieldInitializationRecords(values: ReadonlyMap<Node, CsharpClassFieldInitialization>): CsharpClassFieldInitializationRecords {
  return Object.freeze({ classFieldDefault: Object.freeze({ get: (declaration: Node) => values.get(declaration) }) });
}

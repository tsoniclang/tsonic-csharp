import type { Node } from "@tsonic/tsts";
import type { CsharpLocalBindingCompletion } from "../../../target-model/records/local-bindings.js";

export function createCsharpLocalBindingRecords(values: ReadonlyMap<Node, CsharpLocalBindingCompletion>) {
  return Object.freeze({ localBinding: Object.freeze({
    get: (subject: Node | undefined) => subject === undefined ? undefined : values.get(subject),
  }) });
}

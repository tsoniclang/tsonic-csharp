import type { Node } from "@tsonic/tsts";
import type { CsharpClassPropertyStorage } from "../../../target-model/records/class-property-storage.js";

export function sealCsharpClassPropertyStorage(values: WeakMap<Node, CsharpClassPropertyStorage>):
  (declaration: Node) => CsharpClassPropertyStorage | undefined {
  return declaration => values.get(declaration);
}

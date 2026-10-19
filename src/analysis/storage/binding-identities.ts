import type { Node } from "@tsonic/tsts";
import type { TargetSourceProgram } from "@tsonic/target-api/source";
import type { CsharpBindingIdentity } from "../../target-model/records/binding-identities.js";
import { createCsharpBindingIdentityRecords } from "../program/records/binding-identities.js";

export function analyzeCsharpBindingIdentities(source: TargetSourceProgram, nodes: readonly Node[]) {
  const identities = new Map<Node, CsharpBindingIdentity>();
  for (const node of nodes) {
    const symbol = source.navigation.sourceReferenceFor(node)?.symbol;
    identities.set(node, symbol === undefined ? node : symbol);
  }
  return createCsharpBindingIdentityRecords(identities);
}

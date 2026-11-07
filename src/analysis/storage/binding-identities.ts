import type { Node } from "@tsonic/tsts";
import type { TargetSourceProgramFacts } from "@tsonic/target-api/source";
import type { CsharpBindingIdentity } from "../../target-model/records/storage/binding-identities.js";
import { createCsharpBindingIdentityRecords } from "../program/records/storage/binding-identities.js";

export function analyzeCsharpBindingIdentities(source: TargetSourceProgramFacts, nodes: readonly Node[]) {
  const identities = new Map<Node, CsharpBindingIdentity>();
  for (const node of nodes) {
    // One identity per binding: the declaration a reference denotes (keyed by declaration, never a checker Symbol).
    identities.set(node, source.facts.navigation.identity.target(node)?.declaration ?? node);
  }
  return createCsharpBindingIdentityRecords(identities);
}

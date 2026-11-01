import type { Node } from "@tsonic/tsts";

export interface CsharpCallableSourceIdentity {
  readonly callable: Node;
  readonly sourceOwner: Node;
}

export interface CsharpModuleCallableIdentities {
  readonly get: (subject: Node) => CsharpCallableSourceIdentity | undefined;
}

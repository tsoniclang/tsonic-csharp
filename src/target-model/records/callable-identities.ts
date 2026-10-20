import type { Node } from "@tsonic/tsts";

export type CsharpSourceCallableArtifactIdentity =
  | {
      readonly kind: "declaration";
      readonly declaration: Node;
    }
  | {
      readonly kind: "project-constructor";
      readonly targetMemberId: string;
    };

import type { Node } from "@tsonic/tsts";

export interface CsharpSourceMemberName {
  readonly read: string;
  readonly method: string | undefined;
}

export interface CsharpSourceMemberNameRecords {
  readonly sourceMemberName: { readonly get: (node: Node) => CsharpSourceMemberName | undefined };
}

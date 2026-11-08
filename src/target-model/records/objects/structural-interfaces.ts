import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../types/native-type-data.js";
import type { CsharpObjectShapeMemberFact } from "../../types/model.js";
import type { CsharpNativePropertyRead } from "../program/source-profile-invocations.js";

export interface CsharpStructuralInterfaceImplementation {
  readonly sourceNode: Node;
  readonly sourceType: TargetTypeRef;
  readonly interfaceType: TargetTypeRef;
  readonly properties: readonly ({
    readonly sourceType: TargetTypeRef;
    readonly member: CsharpObjectShapeMemberFact;
  } & ({ readonly native: CsharpNativePropertyRead; readonly sourceName?: never } |
    { readonly native?: never; readonly sourceName: string }))[];
  readonly methods: readonly {
    readonly sourceName: string;
    readonly declaration: Node;
    readonly member: CsharpObjectShapeMemberFact;
  }[];
}

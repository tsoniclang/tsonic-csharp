import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../types/model.js";

export interface CsharpConstructorEntryEmission {
  readonly baseCall: Node | undefined;
  readonly prepared: boolean;
}

export interface CsharpConstructorArgumentEmission {
  readonly kind: "direct" | "helper" | "packet";
  readonly carrier: TargetTypeRef;
  readonly completion: "value" | "never";
  readonly passing: "in" | "out" | "ref" | undefined;
}

export interface CsharpConstructorEmissionRecords {
  readonly constructorEntry: { readonly get: (subject: Node) => CsharpConstructorEntryEmission | undefined };
  readonly constructorArgument: { readonly get: (subject: Node) => CsharpConstructorArgumentEmission | undefined };
}

// Data types of the one Source descriptor -> .NET type mapping (I6). The mapping itself lives in representation/;
// these closed types sit in target-model so that policy (below representation/, R8 layer contract) can name a
// represented type or a C# refusal without importing representation/ (FX-CC-R1).
import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "./model.js";

/** A .NET-capability refusal (CSHARP_* only, R5). Host refusals are forwarded unchanged, never wrapped. */
export interface CsharpRefusal {
  readonly kind: "csharp-refused";
  readonly code: `CSHARP_${string}`;
  readonly message: string;
  readonly site: Node;
}

export type CsharpRepresentation = TargetTypeRef | CsharpRefusal;

/** Where a represented type is used: storage (fields, locals, parameters), a value-only use, a type argument or a return. */
export type CsharpRepresentationPosition = "storage" | "value" | "type-argument" | "return";

import type { Node } from "@tsonic/tsts";
import type { CsharpObjectShapeFact } from "../types/model.js";

export interface CsharpUnsafeEmission {
  readonly context: boolean;
  readonly permission: boolean;
  readonly moduleContext: boolean;
}

export type CsharpSafetyPlacement = "declaration" | "constructor" | "getter" | "setter";

export interface CsharpSafetyEmissionRecords {
  readonly unsafeShape: { readonly get: (subject: CsharpObjectShapeFact) => boolean | undefined };
  readonly unsafeEmission: { readonly get: (subject: Node) => CsharpUnsafeEmission | undefined };
  readonly unsafeCompilation: { readonly get: (subject: Node | "object-shapes" | "source-unions") => boolean | undefined };
  readonly declarationSafety: { readonly get: (subject: Node, placement: CsharpSafetyPlacement) => readonly "unsafe"[] | undefined };
}

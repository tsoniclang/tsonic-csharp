import type { CsharpFrameClosure } from "./capture-storage.js";
import type { CsharpDelegateSignatureShape, CsharpObjectShapeFact, TargetTypeRef } from "../../types/model.js";
import type { CsharpExplicitImplementationConstraint } from "../../types/generic-constraints.js";

export interface CsharpCaptureMethodEmission {
  readonly method: CsharpFrameClosure;
  readonly form: "declaration" | "arrow" | "function";
  readonly quotation: boolean;
  readonly returnsVoid: boolean;
  readonly returnType: TargetTypeRef;
  readonly signature: CsharpDelegateSignatureShape & { readonly returnPassing?: undefined };
  readonly protocolMethods: readonly { readonly interface: TargetTypeRef; readonly name: string;
    readonly explicitConstraints: readonly CsharpExplicitImplementationConstraint[] }[];
}

export interface CsharpCaptureMethodRecords {
  readonly captureMethods: { readonly get: (shape: CsharpObjectShapeFact) => readonly CsharpCaptureMethodEmission[] | undefined };
}

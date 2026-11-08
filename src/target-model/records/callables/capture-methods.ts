import type { CsharpFrameClosure } from "./capture-storage.js";
import type { TargetTypeRef, CsharpExplicitImplementationConstraint } from "../../types/native-type-data.js";
import type { CsharpObjectShapeFact } from "../../types/model.js";
import type { CsharpDelegateSignatureShape } from "../../types/native-type-data.js";

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

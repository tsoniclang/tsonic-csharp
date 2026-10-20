import type { TargetTypeRef } from "../types/model.js";
import type { CsharpRuntimeParameterDefault } from "../types/parameter-defaults.js";
import type { Node } from "@tsonic/tsts";
import type { CsharpDefaultValueContract } from "./value-projections.js";

export type CsharpReturnTargetContract =
  | { readonly kind: "resolved"; readonly type: TargetTypeRef; readonly undefinedReturn?: boolean; readonly fallthroughUndefined?: boolean }
  | { readonly kind: "rejected"; readonly reason: string };

export type CsharpDefaultParameterContract = CsharpRuntimeParameterDefault & {
  readonly acceptsOmission: boolean;
  readonly native: CsharpDefaultValueContract;
  readonly passthrough: boolean;
};

export interface CsharpDeclarationClassifications {
  readonly returnContract: { readonly get: (node: Node) => CsharpReturnTargetContract | undefined };
  readonly runtimeDefault: { readonly get: (node: Node) => CsharpDefaultParameterContract | undefined };
  readonly methodWrite: { readonly get: (node: Node) => { readonly type: TargetTypeRef; readonly storageName: string; readonly implementationName: string } | undefined };
}

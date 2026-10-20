import type { Node } from "@tsonic/tsts";
import type { CsharpResolvedBinaryOperation } from "./operator-selection.js";
import type { CsharpJsValueInvocation } from "../operations/js-values.js";
import type { CsharpNativeLocationSelection } from "./native-locations.js";

export interface CsharpNativeBinaryEmission {
  readonly selection: CsharpResolvedBinaryOperation;
  readonly syntax: "assignment" | "binary" | undefined;
  readonly storage: Node;
  readonly location: Extract<CsharpNativeLocationSelection, { readonly kind: "resolved" }> | undefined;
  readonly rightSuspends: boolean;
  readonly narrowedCoalescing: boolean;
  readonly nativeBoolean: boolean;
  readonly retainOther: boolean;
}

export type CsharpBinaryEmission =
  | { readonly kind: "js-array-mutation" | "type-test" | "typeof-comparison" }
  | { readonly kind: "js-value"; readonly left: Node; readonly right: Node; readonly invocation: CsharpJsValueInvocation }
  | { readonly kind: "property-write"; readonly receiver: Node; readonly name: string; readonly value: Node; readonly invocation: CsharpJsValueInvocation }
  | { readonly kind: "element-write"; readonly receiver: Node; readonly key: Node; readonly value: Node; readonly invocation: CsharpJsValueInvocation }
  | { readonly kind: "native"; readonly selection: CsharpResolvedBinaryOperation };

export interface CsharpBinaryEmissionRecords {
  readonly binaryEmission: { readonly get: (node: Node) => CsharpBinaryEmission | undefined };
  readonly nativeBinaryEmission: { readonly get: (node: Node, selection: CsharpResolvedBinaryOperation) => CsharpNativeBinaryEmission | undefined };
}

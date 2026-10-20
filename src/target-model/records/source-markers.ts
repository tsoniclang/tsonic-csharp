import type { TsonicFixedArrayFact } from "@tsonic/source-core/facts";

import type { Node } from "@tsonic/tsts";

export interface CsharpSourcePointerType {
  readonly kind: "csharp-typed-location";
  readonly sourcePointee: Node;
  readonly mutability: "readonly" | "readwrite" | "unspecified";
}

export interface CsharpSourceFunctionPointerType {
  readonly kind: "csharp-function-pointer";
  readonly sourceParameters: readonly Node[];
  readonly sourceResult: Node;
  readonly abi: readonly string[];
}

export interface CsharpSourceFixedArrayType extends TsonicFixedArrayFact {
  readonly kind: "csharp-fixed-array";
}

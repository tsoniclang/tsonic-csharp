import type { TargetTypeRef } from "../../types/native-type-data.js";
import type { Node } from "@tsonic/tsts";

export type CsharpRawAddressOperationKind = "byte-offset" | "raw-to-address-integer" | "address-integer-to-raw";

export type CsharpRawAddressSelection =
  | { readonly kind: "rejected"; readonly operation: CsharpRawAddressOperationKind; readonly reason: string }
  | { readonly kind: "raw-address"; readonly method: "Address" | "FromAddress" | "Offset" | "OffsetUnsigned";
      readonly width: 32 | 64; readonly resultType: TargetTypeRef; readonly owner: TargetTypeRef;
      readonly arguments: readonly { readonly expression: Node; readonly sourceType: TargetTypeRef;
        readonly parameterType: TargetTypeRef; readonly cast: boolean }[] };

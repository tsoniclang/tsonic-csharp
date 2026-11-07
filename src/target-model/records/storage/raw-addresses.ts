import type { TargetTypeRef } from "../../types/model.js";
import type { TsonicRawAddressRecord } from "@tsonic/source-core/facts";
import type { Node } from "@tsonic/tsts";

export type CsharpSourceRawAddressOperation = TsonicRawAddressRecord;

export type CsharpRawAddressSelection =
  | { readonly kind: "rejected"; readonly operation: CsharpSourceRawAddressOperation["operation"]; readonly reason: string }
  | { readonly kind: "raw-address"; readonly method: "Address" | "FromAddress" | "Offset" | "OffsetUnsigned";
      readonly width: 32 | 64; readonly resultType: TargetTypeRef;
      readonly arguments: readonly { readonly expression: Node; readonly sourceType: TargetTypeRef;
        readonly parameterType: TargetTypeRef; readonly cast: boolean }[] };

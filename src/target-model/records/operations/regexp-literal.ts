import type { TargetTypeRef } from "../../types/model.js";

export type CsharpRegularExpressionLiteralSelection =
  | {
      readonly kind: "resolved";
      readonly pattern: string;
      readonly flags: string;
      readonly targetType: TargetTypeRef;
    }
  | {
      readonly kind: "rejected";
      // The regexp policy codes, or the representation refusal of the literal's carrier, forwarded.
      readonly code: `CSHARP_${string}`;
      readonly message: string;
    };

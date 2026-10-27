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
      readonly code:
        | "CSHARP_JS_REGEXP_SYNTAX_INVALID"
        | "CSHARP_JS_REGEXP_TARGET_NOT_PROVEN";
      readonly message: string;
    };

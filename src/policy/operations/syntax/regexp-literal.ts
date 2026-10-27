import type { CsharpRegularExpressionLiteralSelection } from "../../../target-model/records/operations/regexp-literal.js";
import type { AstRegularExpressionLiteralSyntax } from "@tsonic/tsts";

import { isCsharpJsRegExpTargetType } from "../../types/index.js";

export function selectCsharpNativeRegularExpressionLiteral(
  literal: AstRegularExpressionLiteralSyntax | undefined,
  targetType: import("../../../target-model/types/model.js").TargetTypeRef | undefined,
): CsharpRegularExpressionLiteralSelection {
  if (literal === undefined) {
    return {
      kind: "rejected",
      code: "CSHARP_JS_REGEXP_SYNTAX_INVALID",
      message: "The source node has no exact regular-expression literal syntax evidence.",
    };
  }
  if (!isCsharpJsRegExpTargetType(targetType)) {
    return {
      kind: "rejected",
      code: "CSHARP_JS_REGEXP_TARGET_NOT_PROVEN",
      message:
        "A regular-expression literal requires the explicit JS source profile and its closed C# RegExp target relation.",
    };
  }
  return {
    kind: "resolved",
    pattern: literal.pattern,
    flags: literal.flags,
    targetType,
  };
}

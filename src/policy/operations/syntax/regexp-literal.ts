import type { CsharpRegularExpressionLiteralSelection } from "../../../target-model/records/regexp-literal.js";
import type {
  AstRegularExpressionLiteralSyntax,
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { CsharpTypePolicy } from "../../types/index.js";
import {
  isCsharpJsRegExpTargetType,
} from "../../types/index.js";

export interface CsharpRegularExpressionLiteralPolicyHost {
  readonly ast: {
    readonly regularExpressionLiteral: (
      node: Node | undefined,
    ) => AstRegularExpressionLiteralSyntax | undefined;
  };
  readonly types: CsharpTypePolicy;
}

export function selectCsharpRegularExpressionLiteral(
  host: CsharpRegularExpressionLiteralPolicyHost,
  node: Node,
  sourceFile: SourceFile,
): CsharpRegularExpressionLiteralSelection {
  const literal = host.ast.regularExpressionLiteral(node);
  if (literal === undefined) {
    return {
      kind: "rejected",
      code: "CSHARP_JS_REGEXP_SYNTAX_INVALID",
      message: "The source node has no exact regular-expression literal syntax evidence.",
    };
  }
  const targetType = host.types.resolveNode(node, sourceFile);
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

import type { CsharpRegularExpressionLiteralSelection } from "../../../target-model/records/operations/regexp-literal.js";
import type { AstRegularExpressionLiteralSyntax, Node } from "@tsonic/tsts";
import { isCsharpRefusal } from "../../../representation/index.js";
import type { CsharpTypeQueries } from "../../../policy/model/type-resolution.js";

import { selectCsharpNativeRegularExpressionLiteral } from "../../../policy/operations/syntax/regexp-literal.js";
export interface CsharpRegularExpressionLiteralPolicyHost {
  readonly ast: {
    readonly regularExpressionLiteral: (
      node: Node | undefined,
    ) => AstRegularExpressionLiteralSyntax | undefined;
  };
  readonly types: Pick<CsharpTypeQueries, "value">;
}

export function selectCsharpRegularExpressionLiteral(
  host: CsharpRegularExpressionLiteralPolicyHost,
  node: Node,
): CsharpRegularExpressionLiteralSelection {
  const carrier = host.types.value(node);
  if (isCsharpRefusal(carrier)) return { kind: "rejected", code: carrier.code, message: carrier.message };
  return selectCsharpNativeRegularExpressionLiteral(host.ast.regularExpressionLiteral(node), carrier);
}

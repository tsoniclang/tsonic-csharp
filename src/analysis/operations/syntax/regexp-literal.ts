import type { CsharpRegularExpressionLiteralSelection } from "../../../target-model/records/regexp-literal.js";
import type { AstRegularExpressionLiteralSyntax, Node, SourceFile } from "@tsonic/tsts";
import type { CsharpTypeQueries } from "../../../policy/model/type-resolution.js";

import { selectCsharpNativeRegularExpressionLiteral } from "../../../policy/operations/syntax/regexp-literal.js";
export interface CsharpRegularExpressionLiteralPolicyHost {
  readonly ast: {
    readonly regularExpressionLiteral: (
      node: Node | undefined,
    ) => AstRegularExpressionLiteralSyntax | undefined;
  };
  readonly types: Pick<CsharpTypeQueries, "resolveNode">;
}

export function selectCsharpRegularExpressionLiteral(
  host: CsharpRegularExpressionLiteralPolicyHost,
  node: Node,
  sourceFile: SourceFile,
): CsharpRegularExpressionLiteralSelection {
  return selectCsharpNativeRegularExpressionLiteral(host.ast.regularExpressionLiteral(node), host.types.resolveNode(node, sourceFile));
}

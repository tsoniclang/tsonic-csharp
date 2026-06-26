import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  TargetCompileInput,
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpExpression,
  CsharpTypeNode,
} from "../../roslyn/syntax.js";

export interface ArrayLiteralPlanner {
  readonly planExpression: (
    node: Node,
    sourceFile: SourceFile,
    input: TargetCompileInput,
    diagnostics: TargetDiagnostic[],
  ) => CsharpExpression | undefined;
  readonly planExpressionWithExpectedType: (
    node: Node,
    sourceFile: SourceFile,
    input: TargetCompileInput,
    diagnostics: TargetDiagnostic[],
    expectedType: CsharpTypeNode,
  ) => CsharpExpression | undefined;
}

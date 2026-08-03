import type {
  CsharpTranslationContext } from "../../../translate/context/index.js";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetTypeRef } from "../../../policy/types/index.js";
import type {
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
    input: CsharpTranslationContext,
    diagnostics: TargetDiagnostic[],
  ) => CsharpExpression | undefined;
  readonly planExpressionWithExpectedType: (
    node: Node,
    sourceFile: SourceFile,
    input: CsharpTranslationContext,
    diagnostics: TargetDiagnostic[],
    expectedType: CsharpTypeNode,
    expectedTypeSubject?: Node,
    expectedTargetType?: TargetTypeRef,
  ) => CsharpExpression | undefined;
}

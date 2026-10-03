import type { CsharpPlanningContext } from "../../context.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpAttribute } from "../../../target-ast/roslyn/index.js";
import { planExpression } from "../../expressions/index.js";

export function planAttributesForSubject(
  subject: Node | undefined,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): readonly CsharpAttribute[] | undefined {
  const attributes = subject === undefined ? [] : input.program.attributeApplications.forDeclaration(subject);
  if (attributes.length === 0) return undefined;
  return attributes.flatMap(attribute => {
    const planned = planExpression(attribute.invocation, sourceFile, input, diagnostics);
    if (planned === undefined) return [];
    const construction = planned.completion.kind === "value" ? planned.completion.expression : undefined;
    if (planned.prelude.length !== 0 || construction?.kind !== "ObjectCreationExpression" ||
      construction.assignments !== undefined || construction.collectionInitializers !== undefined) {
      diagnostics.push({ code: "CSHARP_UNSUPPORTED_ATTRIBUTE_APPLICATION", category: "error", source: "tsonic-csharp",
        message: "C# attribute application must emit a native attribute construction without a factory or runtime conversion.",
        sourceNode: attribute.invocation });
      return [];
    }
    return [{ ...(attribute.targetSpecifier === undefined ? {} : { targetSpecifier: attribute.targetSpecifier }),
      type: construction.type, arguments: construction.arguments ?? [] }];
  });
}

export function isErasedAttributeExpressionStatement(statement: Node, input: CsharpPlanningContext): boolean {
  const expression = input.program.source.ast.as.AsExpressionStatement(statement)?.Expression;
  return expression !== undefined && input.program.attributeApplications.isErasedSubject(expression);
}

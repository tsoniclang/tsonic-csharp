import { failCsharpPlannerInvariant } from "../diagnostics.js";
import type { CsharpPlanningContext } from "../context.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpAttribute } from "../../target-ast/syntax/index.js";
import { planExpression } from "../expressions/index.js";

export function planAttributesForSubject(
  subject: Node | undefined,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): readonly CsharpAttribute[] | undefined {
  const attributes = subject === undefined ? [] : input.program.records.attributeApplication.get(subject);
  if (attributes.length === 0) return undefined;
  return attributes.flatMap(attribute => {
    const planned = planExpression(attribute.invocation, sourceFile, input, diagnostics);
    if (planned === undefined) return [];
    const construction = planned.completion.kind === "value" ? planned.completion.expression : undefined;
    if (planned.prelude.length !== 0 || construction?.kind !== "ObjectCreationExpression" ||
      construction.assignments !== undefined || construction.collectionInitializers !== undefined) {
      return failCsharpPlannerInvariant(
        "C# planning received an admitted attribute application that did not plan as one native attribute construction.",
        attribute.invocation,
      );
    }
    return [{ ...(attribute.targetSpecifier === undefined ? {} : { targetSpecifier: attribute.targetSpecifier }),
      type: construction.type, arguments: construction.arguments ?? [] }];
  });
}

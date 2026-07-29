import type { CsharpTranslationContext } from "../../../translate/context/index.js";
import type { SourceFile } from "@tsonic/tsts";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import {
  collectAttributeApplicationFactsForSourceFile,
} from "./collection.js";
import {
  attributeApplicationDiagnostic,
} from "./diagnostics.js";
import {
  resolveAttributeApplication,
} from "./resolution.js";

export function diagnoseUnresolvedAttributeApplications(
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
): void {
  const reported = new Set<ReturnType<typeof collectAttributeApplicationFactsForSourceFile>[number]>();
  for (const attribute of collectAttributeApplicationFactsForSourceFile(sourceFile, input)) {
    if (reported.has(attribute)) {
      continue;
    }
    reported.add(attribute);
    const resolution = resolveAttributeApplication(attribute, sourceFile, input);
    if (resolution.applicationTarget === undefined) {
      diagnostics.push(attributeApplicationDiagnostic(attribute, "must carry an AST application target from finalized TSTS facts before C# emission."));
      continue;
    }
    if (resolution.selectedDeclaration === undefined) {
      diagnostics.push(attributeApplicationDiagnostic(attribute, "target must resolve to a project source declaration from finalized TSTS facts before C# emission."));
      continue;
    }
    if (attribute.applicationPlacement === "constructor" && resolution.declaration === undefined) {
      diagnostics.push(attributeApplicationDiagnostic(attribute, "requires an explicit source constructor declaration; implicit default constructors have no finalized source declaration to attach attributes to."));
      continue;
    }
    if (attribute.applicationParameterName !== undefined && resolution.parameter === undefined) {
      diagnostics.push(attributeApplicationDiagnostic(attribute, `could not find parameter '${attribute.applicationParameterName}' on the finalized source declaration target.`));
    }
  }
}

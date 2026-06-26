import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
} from "@tsonic/tsts";
import {
  csharpObjectShapeFactKey,
} from "../../csharp-facts.js";
import type {
  CsharpObjectShapeFact,
} from "../../csharp-facts.js";
import {
  subjectHasSourceDeclaredStructRuntimeCarrier,
} from "../object-shape-recorded-facts.js";
import {
  getSemanticSubjects,
} from "./semantic-subjects.js";

export function recordCsharpObjectShapeFactForSubject(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
  fact: CsharpObjectShapeFact,
): void {
  if (subjectHasSourceDeclaredStructRuntimeCarrier(subject, context) && !isSourceDeclaredStructObjectShapeFact(fact)) {
    return;
  }
  const evidence = [{ message: "C# object-shape fact recorded by canonical object-shape resolver." }];
  if (subject !== undefined) {
    context.facts.set(subject, csharpObjectShapeFactKey, fact, evidence);
  }
  for (const semanticSubject of getSemanticSubjects(subject, context)) {
    if (subjectHasSourceDeclaredStructRuntimeCarrier(semanticSubject, context) && !isSourceDeclaredStructObjectShapeFact(fact)) {
      continue;
    }
    context.facts.set(semanticSubject, csharpObjectShapeFactKey, fact, evidence);
  }
}

function isSourceDeclaredStructObjectShapeFact(fact: CsharpObjectShapeFact): boolean {
  return fact.targetType.kind === "target-named" &&
    (fact.targetType as { readonly csharpSourceDeclarationKind?: string }).csharpSourceDeclarationKind === "struct";
}

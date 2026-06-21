import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
} from "@tsonic/tsts";
import type {
  CsharpObjectShapeFact,
} from "../csharp-facts.js";
import {
  asNodeSubject,
} from "./ast-utils.js";
import {
  getDeclarationTypeNode,
} from "./symbol-utils.js";
import {
  deriveCsharpObjectShapeFactForSemanticSubject,
} from "./object-shape-semantic-facts.js";
import {
  deriveCsharpObjectShapeFactForSubject,
} from "./object-shape-type-literal-facts.js";
import {
  getRecordedCsharpObjectShapeFactForSubject,
} from "./object-shape-recorded-facts.js";
import type {
  CsharpObjectShapeSemanticsHost,
} from "./object-shape-types.js";

export {
  getTargetTypeRefForSyntaxNode,
  recordCsharpSourceFileFacts,
} from "./object-shape-syntax-facts.js";
export type {
  CsharpObjectShapeSemanticsHost,
} from "./object-shape-types.js";
export {
  getRecordedCsharpObjectShapeFactForSubject,
} from "./object-shape-recorded-facts.js";
export {
  getSemanticTypeDeclarationShape,
} from "./object-shape-semantic-facts.js";

export function getCsharpObjectShapeFactForSubject(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
  host: CsharpObjectShapeSemanticsHost,
): CsharpObjectShapeFact | undefined {
  const recorded = getRecordedCsharpObjectShapeFactForSubject(subject, context);
  if (recorded !== undefined) {
    return recorded;
  }
  const semanticFact = deriveCsharpObjectShapeFactForSemanticSubject(subject, context, host);
  if (semanticFact !== undefined) {
    return semanticFact;
  }
  const declarationType = getDeclarationTypeNode(subject, context);
  return deriveCsharpObjectShapeFactForSubject(declarationType ?? asNodeSubject(subject), context, host);
}

import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  TargetTypeRef,
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
  asNodeSubject,
  isTypeSyntaxNode,
} from "../ast-utils.js";
import {
  getSemanticSubjects,
} from "./semantic-subjects.js";
import {
  targetTypeRefEquals,
  targetTypeRefKey,
} from "../target-ref-utils.js";

const objectShapesByFactStoreAndTarget = new WeakMap<object, Map<string, CsharpObjectShapeFact>>();

export function getRecordedCsharpObjectShapeFactByTargetType(
  type: TargetTypeRef,
  context: ExtensionObservationContext,
): CsharpObjectShapeFact | undefined {
  return objectShapesByFactStoreAndTarget.get(context.facts)?.get(targetTypeRefKey(type));
}

export function getRecordedCsharpObjectShapeFacts(
  context: ExtensionObservationContext,
): readonly CsharpObjectShapeFact[] {
  return [...(objectShapesByFactStoreAndTarget.get(context.facts)?.values() ?? [])];
}

export function recordCsharpObjectShapeFactForSubject(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
  fact: CsharpObjectShapeFact,
): void {
  if (subjectHasSourceDeclaredStructRuntimeCarrier(subject, context) && !isSourceDeclaredStructObjectShapeFact(fact)) {
    return;
  }
  const evidence = [{ message: "C# object-shape fact recorded by canonical object-shape resolver." }];
  const targetKey = targetTypeRefKey(fact.targetType);
  let shapesByTarget = objectShapesByFactStoreAndTarget.get(context.facts);
  if (shapesByTarget === undefined) {
    shapesByTarget = new Map();
    objectShapesByFactStoreAndTarget.set(context.facts, shapesByTarget);
  }
  const existingTargetShape = shapesByTarget.get(targetKey);
  const recordedFact = existingTargetShape !== undefined && objectShapeCarrierEquals(existingTargetShape, fact)
    ? { ...fact, targetType: existingTargetShape.targetType }
    : fact;
  if (existingTargetShape === undefined) {
    shapesByTarget.set(targetKey, recordedFact);
  }
  if (subject !== undefined) {
    context.facts.set(subject, csharpObjectShapeFactKey, recordedFact, evidence);
  }
  context.facts.set(recordedFact.targetType, csharpObjectShapeFactKey, existingTargetShape ?? recordedFact, evidence);
  if (subjectIsTypeSyntax(subject, context)) {
    return;
  }
  for (const semanticSubject of getSemanticSubjects(subject, context)) {
    if (subjectHasSourceDeclaredStructRuntimeCarrier(semanticSubject, context) && !isSourceDeclaredStructObjectShapeFact(recordedFact)) {
      continue;
    }
    context.facts.set(semanticSubject, csharpObjectShapeFactKey, recordedFact, evidence);
  }
}

function objectShapeCarrierEquals(left: CsharpObjectShapeFact, right: CsharpObjectShapeFact): boolean {
  return targetTypeRefEquals(left.targetType, right.targetType) &&
    left.constructible === right.constructible &&
    targetTypeArrayEquals(left.implements, right.implements) &&
    left.members.length === right.members.length &&
    left.members.every((member, index) => {
      const other = right.members[index];
      return other !== undefined &&
        member.sourceName === other.sourceName &&
        member.targetName === other.targetName &&
        member.memberKind === other.memberKind &&
        member.optional === other.optional &&
        member.readonly === other.readonly &&
        targetTypeRefEquals(member.type, other.type);
    });
}

function targetTypeArrayEquals(
  left: readonly TargetTypeRef[] | undefined,
  right: readonly TargetTypeRef[] | undefined,
): boolean {
  const leftTypes = left ?? [];
  const rightTypes = right ?? [];
  return leftTypes.length === rightTypes.length &&
    leftTypes.every((type, index) => {
      const other = rightTypes[index];
      return other !== undefined && targetTypeRefEquals(type, other);
    });
}

function isSourceDeclaredStructObjectShapeFact(fact: CsharpObjectShapeFact): boolean {
  return fact.targetType.kind === "target-named" &&
    (fact.targetType as { readonly csharpSourceDeclarationKind?: string }).csharpSourceDeclarationKind === "struct";
}

function subjectIsTypeSyntax(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): boolean {
  const compiler = context.compiler;
  const node = asNodeSubject(subject);
  return compiler !== undefined && node !== undefined && isTypeSyntaxNode(compiler.ast, node);
}

import {
  HasSourceKind,
  KindIdentifier,
  KindStringLiteral,
  Node_Name,
  Node_Text,
} from "./source-ast.js";
import type {
  Node,
  SourceFile,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  TargetCompileInput,
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpObjectInitializerAssignment,
} from "../roslyn/syntax.js";
import type {
  CsharpObjectShapeFact,
} from "../../source/csharp-facts.js";
import {
  resolveCsharpObjectShapeMemberByFinalizedSourceName,
} from "../../source/csharp-facts.js";
import {
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";
import {
  getCsharpObjectShapeFactForNode,
  getCsharpObjectShapeFactForTargetType,
} from "./csharp-fact-queries.js";
import {
  targetTypeRefsMatch,
} from "./target-types.js";

export function getExpectedObjectShapeFact(
  expectedTypeSubject: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  expectedTargetType?: TargetTypeRef,
): CsharpObjectShapeFact | undefined {
  return getCsharpObjectShapeFactForTargetType(expectedTargetType, input) ??
    getCsharpObjectShapeFactForNode(expectedTypeSubject, sourceFile, input);
}

export function findObjectShapeMember(
  objectShape: CsharpObjectShapeFact,
  sourceName: string,
): CsharpObjectShapeFact["members"][number] | undefined {
  const lookup = resolveCsharpObjectShapeMemberByFinalizedSourceName(objectShape, sourceName, "checked-object-literal-property");
  return lookup.kind === "resolved" ? lookup.member : undefined;
}

export function mergeObjectInitializerAssignments(
  assignments: readonly CsharpObjectInitializerAssignment[],
): readonly CsharpObjectInitializerAssignment[] {
  const merged = new Map<string, CsharpObjectInitializerAssignment>();
  for (const assignment of assignments) {
    merged.set(assignment.name, assignment);
  }
  return [...merged.values()];
}

export function objectShapeMemberTypesMatch(
  left: CsharpObjectShapeFact["members"][number],
  right: CsharpObjectShapeFact["members"][number],
): boolean {
  return targetTypeRefsMatch(left.type, right.type);
}

export function getObjectLiteralPropertySourceName(
  property: Node,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): string | undefined {
  const nameNode = input.ast.name(property) ?? Node_Name(property);
  if (nameNode === undefined || (!HasSourceKind(input.ast, nameNode, KindIdentifier) && !HasSourceKind(input.ast, nameNode, KindStringLiteral))) {
    diagnostics.push(unsupportedNodeDiagnostic(nameNode ?? property, "Object-shape object initializers require identifier or string-literal property names."));
    return undefined;
  }
  return Node_Text(nameNode);
}

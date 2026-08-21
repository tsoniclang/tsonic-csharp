import type { CsharpPlanningContext } from "../context.js";
import {
  HasSourceKind,
  KindIdentifier,
  KindNumericLiteral,
  KindStringLiteral,
  Node_Name,
  Node_Text,
} from "@tsonic/target-api/source";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import {
  targetTypeRefEquals,
  type TargetTypeRef,
} from "../../../target-model/types/index.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpObjectInitializerAssignment,
} from "../../target-ast/roslyn/index.js";
import type {
  CsharpObjectShapeFact,
} from "../../../target-model/types/index.js";
import {
  resolveCsharpObjectShapeMemberBySourceContract,
} from "../../../target-model/types/index.js";
import {
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";
import {
  getCsharpObjectShapeFactForNode,
  getCsharpObjectShapeFactForTargetType,
} from "../objects/fact-queries.js";
import {
  parseFiniteNumberLiteral,
} from "../../../target-model/syntax/literal-values.js";

export function getExpectedObjectShapeFact(
  expectedTypeSubject: Node | undefined,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  expectedTargetType?: TargetTypeRef,
): CsharpObjectShapeFact | undefined {
  return getCsharpObjectShapeFactForTargetType(expectedTargetType, input) ??
    getCsharpObjectShapeFactForNode(expectedTypeSubject, sourceFile, input);
}

export function findObjectShapeMember(
  objectShape: CsharpObjectShapeFact,
  sourceName: string,
): CsharpObjectShapeFact["members"][number] | undefined {
  const lookup = resolveCsharpObjectShapeMemberBySourceContract(
    objectShape,
    sourceName,
    "checked-object-literal-property",
  );
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
  return targetTypeRefEquals(left.type, right.type);
}

export function getObjectLiteralPropertySourceName(
  property: Node,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): string | undefined {
  const nameNode = input.program.source.ast.name(property) ?? Node_Name(input.program.source.ast, property);
  if (nameNode === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      property,
      "Object-shape object initializers require an exact authored property name.",
    ));
    return undefined;
  }
  if (HasSourceKind(input.program.source.ast, nameNode, KindNumericLiteral)) {
    const value = parseFiniteNumberLiteral(Node_Text(input.program.source.ast, nameNode));
    if (value === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(
        nameNode,
        "Object-shape numeric property names require exact finite source literal semantics.",
      ));
      return undefined;
    }
    return String(value);
  }
  if (!HasSourceKind(input.program.source.ast, nameNode, KindIdentifier) &&
    !HasSourceKind(input.program.source.ast, nameNode, KindStringLiteral)) {
    diagnostics.push(unsupportedNodeDiagnostic(
      nameNode,
      "Object-shape object initializers require identifier, string-literal, or numeric-literal property names.",
    ));
    return undefined;
  }
  return Node_Text(input.program.source.ast, nameNode);
}

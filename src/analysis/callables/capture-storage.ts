import type { Node } from "@tsonic/tsts";
import type { TargetSourceProgram } from "@tsonic/target-api/source";
import { sourceBindingScope } from "@tsonic/target-api/source";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpObjectShapeClassifications } from "../object-shapes/model.js";
import type { CsharpStorageClassifications, CsharpStorageIssue } from "../storage/model.js";
import { createStructuralObjectShapeTarget } from "../../policy/types/objects/object-shape-policy/construction.js";
import { csharpRuntimeLocationTargetType, csharpRuntimeNativeArrayTargetType } from "../../target-model/types/runtime-carriers.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";

export interface CsharpCaptureFrame {
  readonly scope: Node;
  readonly shape: CsharpObjectShapeFact;
  readonly bindings: readonly { readonly declaration: Node; readonly fieldName: string; readonly type: TargetTypeRef }[];
}

export interface CsharpCapturedBinding {
  readonly frame: CsharpCaptureFrame;
  readonly fieldName: string;
}

export interface CsharpCaptureStorage {
  readonly issues: readonly CsharpStorageIssue[];
  readonly frames: readonly CsharpCaptureFrame[];
  frame(scope: Node): CsharpCaptureFrame | undefined;
  binding(declaration: Node): CsharpCapturedBinding | undefined;
  physicalType(declaration: Node, logicalType: TargetTypeRef): TargetTypeRef;
}

export function analyzeCsharpCaptureStorage(
  source: TargetSourceProgram,
  shapes: CsharpObjectShapeClassifications,
  storage: CsharpStorageClassifications,
): CsharpCaptureStorage {
  const groups = new Map<Node, Map<Node, TargetTypeRef>>();
  const issues: CsharpStorageIssue[] = [];
  const physicalType = (declaration: Node, logicalType: TargetTypeRef): TargetTypeRef => {
    const backing = storage.nativeBacking(declaration);
    if (backing !== undefined) return csharpRuntimeLocationTargetType(backing.pointeeType);
    const array = storage.nativeArray(declaration);
    return array === undefined ? storage.type(declaration) ?? logicalType : csharpRuntimeNativeArrayTargetType(array.layout.pointeeType);
  };
  for (const shape of shapes.knownShapes()) {
    for (const capture of (shape.declarationTemplate ?? shape).methodImplementation?.captures ?? []) {
      if (!capture.mutable || storage.nativeBacking(capture.declaration) !== undefined) continue;
      if (hasSingleCaptureOwner(source, capture.declaration, shape.declarationTemplate ?? shape)) continue;
      const scope = sourceBindingScope(capture.declaration, source.ast);
      if (scope === undefined || source.ast.is.IsSourceFile(scope)) {
        issues.push({ node: capture.declaration, code: "CSHARP_CAPTURE_SCOPE_NOT_CLOSED",
          message: "A captured binding requires its exact retained lexical activation scope." });
        continue;
      }
      const bindings = groups.get(scope) ?? new Map<Node, TargetTypeRef>();
      const type = physicalType(capture.declaration, capture.type);
      const existing = bindings.get(capture.declaration);
      if (existing !== undefined && !targetTypeRefEquals(existing, type)) {
        issues.push({ node: capture.declaration, code: "CSHARP_CAPTURE_STORAGE_CONFLICT",
          message: "One captured binding cannot have incompatible physical storage contracts." });
      }
      bindings.set(capture.declaration, type);
      groups.set(scope, bindings);
    }
  }
  const byScope = new Map<Node, CsharpCaptureFrame>();
  const byBinding = new Map<Node, CsharpCapturedBinding>();
  for (const [scope, group] of groups) {
    const bindings = Object.freeze([...group].map(([declaration, type], index) => Object.freeze({
      declaration, type, fieldName: `value${index}`,
    })));
    const members: readonly CsharpObjectShapeMemberFact[] = Object.freeze(bindings.map(binding => Object.freeze({
      sourceKey: { kind: "property" as const, name: binding.fieldName }, sourceName: binding.fieldName,
      targetName: binding.fieldName, type: binding.type, memberKind: "property" as const,
    })));
    const frame = Object.freeze({ scope, bindings, shape: Object.freeze({
      targetType: createStructuralObjectShapeTarget(members, undefined), members,
    }) });
    byScope.set(scope, frame);
    for (const binding of bindings) byBinding.set(binding.declaration, Object.freeze({ frame, fieldName: binding.fieldName }));
  }
  return Object.freeze({ issues: Object.freeze(issues), frames: Object.freeze([...byScope.values()]),
    frame: (scope: Node) => byScope.get(scope), binding: (declaration: Node) => byBinding.get(declaration), physicalType,
  });
}

function hasSingleCaptureOwner(source: TargetSourceProgram, declaration: Node, shape: CsharpObjectShapeFact): boolean {
  const implementation = shape.methodImplementation;
  if (implementation === undefined) return false;
  const methods = new Set(shape.members.flatMap(member => (member.typeParameters?.length ?? 0) === 0 ? []
    : (member.sourceDeclarations ?? []).filter(method => source.ast.parent(method) === implementation.declaration)));
  const scope = sourceBindingScope(declaration, source.ast);
  let current: Node | undefined = implementation.declaration;
  while (current !== undefined && current !== scope) {
    if (["KindForStatement", "KindForInStatement", "KindForOfStatement", "KindWhileStatement", "KindDoStatement",
      "KindArrowFunction", "KindFunctionExpression", "KindFunctionDeclaration", "KindMethodDeclaration"].includes(source.ast.kindName(current))) return false;
    current = source.ast.parent(current);
  }
  if (current !== scope || scope === undefined) return false;
  const uses = source.navigation.declarationUseSummary(declaration);
  return !uses.exported && uses.uses.every(use => {
    if (use.kind === "type-only") return true;
    for (let owner = source.ast.parent(use.reference); owner !== undefined; owner = source.ast.parent(owner)) {
      if (methods.has(owner)) return true;
      if (owner === implementation.declaration || owner === scope) return false;
    }
    return false;
  });
}

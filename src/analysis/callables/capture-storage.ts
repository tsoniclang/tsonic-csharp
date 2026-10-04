import type { Node } from "@tsonic/tsts";
import type { TargetSourceProgram } from "@tsonic/target-api/source";
import { sourceBindingScope, sourceBindingHasSingleCaptureOwner, sourceNodeIdentity, sourceBindingCapturedBeforeInitialization,
  sourceLexicalFunctionValueCreation, sourceLexicalFunctionValueOrder } from "@tsonic/target-api/source";
import type { SourceLexicalValueCreation } from "@tsonic/target-api/source";
import { createHash } from "node:crypto";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpObjectShapeClassifications } from "../objects/model.js";
import type { CsharpStorageClassifications, CsharpStorageIssue } from "../storage/model.js";
import { createStructuralObjectShapeTarget } from "../../policy/types/objects/object-shape-policy/construction.js";
import { csharpRuntimeLocationTargetType, csharpRuntimeNativeArrayTargetType } from "../../target-model/types/runtime-carriers.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../target-model/types/equality.js";
import type { CsharpSourceEvidenceIndex } from "../source-evidence/model.js";
import { selectCsharpFrameClosures, type CsharpFrameClosure } from "./capture-closures.js";
import { csharpTargetNamedType } from "../../target-model/types/factories.js";

export interface CsharpCaptureFrame {
  readonly scope: Node;
  readonly shape: CsharpObjectShapeFact;
  readonly bindings: readonly { readonly declaration: Node; readonly fieldName: string; readonly type: TargetTypeRef;
    readonly initialization?: "deferred" }[];
  readonly parents: readonly { readonly frame: CsharpCaptureFrame; readonly fieldName: string }[];
  readonly methods: readonly CsharpFrameClosure[];
  readonly receivers: readonly { readonly owner: Node; readonly references: readonly Node[]; readonly type: TargetTypeRef; readonly fieldName: string }[];
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
  closure(declaration: Node): { readonly frame: CsharpCaptureFrame; readonly method: CsharpFrameClosure } | undefined;
  forShape(type: TargetTypeRef): CsharpCaptureFrame | undefined;
  valueDeclarationsAt(statement: Node): readonly Node[];
  valueCreation(declaration: Node): SourceLexicalValueCreation | undefined;
}

export function analyzeCsharpCaptureStorage(
  source: TargetSourceProgram,
  shapes: CsharpObjectShapeClassifications,
  storage: CsharpStorageClassifications,
  evidence: CsharpSourceEvidenceIndex,
  classCaptures: readonly import("../project-types/class-factories.js").CsharpClassCapture[],
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
      if (!shapes.methodImplementationHasCopies(shape) && hasSingleCaptureOwner(source, capture.declaration, shape.declarationTemplate ?? shape)) continue;
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
  for (const capture of classCaptures) {
    if (!capture.mutable || storage.nativeBacking(capture.declaration) !== undefined) continue;
    const scope = sourceBindingScope(capture.declaration, source.ast);
    if (scope === undefined || source.ast.is.IsSourceFile(scope)) {
      issues.push({ node: capture.declaration, code: "CSHARP_CAPTURE_SCOPE_NOT_CLOSED",
        message: "A mutable class capture requires its exact lexical activation scope." });
      continue;
    }
    const bindings = groups.get(scope) ?? new Map<Node, TargetTypeRef>();
    const type = physicalType(capture.declaration, capture.type);
    const existing = bindings.get(capture.declaration);
    if (existing !== undefined && !targetTypeRefEquals(existing, type)) {
      issues.push({ node: capture.declaration, code: "CSHARP_CAPTURE_STORAGE_CONFLICT",
        message: "One class capture cannot have incompatible native storage contracts." });
    }
    bindings.set(capture.declaration, type);
    groups.set(scope, bindings);
  }
  const closures = selectCsharpFrameClosures(source, evidence, groups, physicalType, issues);
  const byScope = new Map<Node, CsharpCaptureFrame>();
  const byBinding = new Map<Node, CsharpCapturedBinding>();
  const byClosure = new Map<Node, { readonly frame: CsharpCaptureFrame; readonly method: CsharpFrameClosure }>();
  const byShape = new Map<string, CsharpCaptureFrame>();
  const buildFrame = (scope: Node): CsharpCaptureFrame => {
    const previous = byScope.get(scope);
    if (previous !== undefined) return previous;
    const group = groups.get(scope)!;
    const methods = Object.freeze(closures.filter(closure => closure.scope === scope));
    const parentScopes = new Set(methods.flatMap(method => method.captures.flatMap(declaration => {
      const parentScope = sourceBindingScope(declaration, source.ast);
      return parentScope === undefined || parentScope === scope ? [] : [parentScope];
    })));
    const parents = Object.freeze([...parentScopes].map((parent, index) => Object.freeze({ frame: buildFrame(parent), fieldName: `parent${index}` })));
    const receiverMap = new Map<Node, CsharpFrameClosure["receivers"][number]>();
    for (const method of methods) for (const receiver of method.receivers) {
      const previous = receiverMap.get(receiver.owner);
      receiverMap.set(receiver.owner, { ...receiver, references: Object.freeze([
        ...new Set([...(previous?.references ?? []), ...receiver.references]),
      ]) });
    }
    const receivers = Object.freeze([...receiverMap.values()].map((receiver, index) => Object.freeze({ ...receiver, fieldName: `receiver${index}` })));
    const bindings = Object.freeze([...group].map(([declaration, type], index) => Object.freeze({
      declaration, type, fieldName: `value${index}`,
      ...(sourceBindingCapturedBeforeInitialization(declaration, source.ast, source.navigation) ? { initialization: "deferred" as const } : {}),
    })));
    const fields = [...bindings, ...parents.map(parent => ({ fieldName: parent.fieldName, type: parent.frame.shape.targetType })), ...receivers];
    const members: readonly CsharpObjectShapeMemberFact[] = Object.freeze(fields.map(field => Object.freeze({
      sourceKey: { kind: "property" as const, name: field.fieldName }, sourceName: field.fieldName,
      targetName: field.fieldName, type: field.type, memberKind: "property" as const,
    })));
    const selectedType = createStructuralObjectShapeTarget(members, undefined);
    const identity = sourceNodeIdentity(source.ast, scope);
    if (identity === undefined || selectedType.kind !== "target-named") throw new Error("A native capture frame requires an exact named source identity.");
    const digest = createHash("sha256").update(identity).digest("hex");
    const type = csharpTargetNamedType(`tsonic.shape:capture_${digest}`, selectedType.typeArguments,
      { kind: "named", name: `__TsonicCapture_${digest}` });
    const frame: CsharpCaptureFrame = Object.freeze({ scope, bindings, parents, methods, receivers, shape: Object.freeze({
      targetType: type, members,
    }) });
    byScope.set(scope, frame);
    byShape.set(targetTypeRefKey(type), frame);
    for (const binding of bindings) byBinding.set(binding.declaration, Object.freeze({ frame, fieldName: binding.fieldName }));
    for (const method of methods) byClosure.set(method.declaration, Object.freeze({ frame, method }));
    return frame;
  };
  for (const scope of groups.keys()) buildFrame(scope);
  const valueDeclarations = new Map<Node, Node[]>();
  const valueCreations = new Map<Node, SourceLexicalValueCreation>();
  const visitValues = (node: Node): void => {
    if (source.ast.is.IsFunctionDeclaration(node) && source.ast.body(node) !== undefined &&
      !source.ast.is.IsSourceFile(source.ast.parent(node))) {
      const creation = sourceLexicalFunctionValueCreation(node, source.ast, source.navigation,
        use => !evidence.isCompileTimeMetadata(use.reference));
      valueCreations.set(node, creation);
      if (creation.kind === "unresolved") issues.push({ node, code: "CSHARP_LEXICAL_VALUE_ACTIVATION_NOT_CLOSED", message: creation.reason });
      if (creation.kind === "resolved") {
        const values = valueDeclarations.get(creation.statement) ?? [];
        values.push(node);
        valueDeclarations.set(creation.statement, values);
      }
    }
    source.ast.forEachChild(node, child => { if (child !== undefined) visitValues(child); });
  };
  source.navigation.sourceFiles.forEach(visitValues);
  const empty: readonly Node[] = Object.freeze([]);
  const scheduledValues = new Map<Node, readonly Node[]>();
  for (const [statement, values] of valueDeclarations) {
    const ordered = sourceLexicalFunctionValueOrder(values, source.ast, source.navigation,
      use => !evidence.isCompileTimeMetadata(use.reference));
    if (ordered.kind === "resolved") scheduledValues.set(statement, ordered.declarations);
    else issues.push({ node: statement, code: "CSHARP_LEXICAL_VALUE_ACTIVATION_NOT_CLOSED", message: ordered.reason });
  }
  return Object.freeze({ issues: Object.freeze(issues), frames: Object.freeze([...byScope.values()]),
    frame: (scope: Node) => byScope.get(scope), binding: (declaration: Node) => byBinding.get(declaration), physicalType,
    closure: (declaration: Node) => byClosure.get(declaration), forShape: (type: TargetTypeRef) => byShape.get(targetTypeRefKey(type)),
    valueDeclarationsAt: (statement: Node) => scheduledValues.get(statement) ?? empty,
    valueCreation: (declaration: Node) => valueCreations.get(declaration),
  });
}

function hasSingleCaptureOwner(source: TargetSourceProgram, declaration: Node, shape: CsharpObjectShapeFact): boolean {
  const implementation = shape.methodImplementation;
  if (implementation === undefined) return false;
  return sourceBindingHasSingleCaptureOwner(declaration, implementation.declaration,
    implementation.methods, source.ast, source.navigation);
}

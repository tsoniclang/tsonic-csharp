import type { Node } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../policy/context.js";
import { selectCsharpNativeMemoryLayout, selectCsharpRawLocation } from "../../policy/operations/pointers/native-memory.js";
import type { CsharpNativeMemoryLayout } from "../../target-model/operations/native-memory.js";
import { csharpNativeMemoryLayoutsEqual } from "../../target-model/operations/native-memory.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../target-model/types/equality.js";
import { csharpStructuralObjectShapeIdentity } from "../../target-model/types/object-shape-identity.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpSourceEvidenceIndex } from "../source-evidence/index.js";
import type { CsharpTargetOperationClassifications } from "../operations/index.js";
import type { CsharpNativeObjectField, CsharpNativeArrayStorage, CsharpStorageIssue } from "./model.js";

export function analyzeCsharpNativeBacking(
  policy: CsharpPolicyContext, evidence: CsharpSourceEvidenceIndex,
  operations: CsharpTargetOperationClassifications,
) {
  const backings = new Map<Node, CsharpNativeMemoryLayout>();
  const fields = new Map<string, CsharpNativeObjectField>();
  const arrays = new Map<Node, CsharpNativeArrayStorage>();
  const fieldKey = (owner: TargetTypeRef, name: string): string => JSON.stringify([targetTypeRefKey(owner), name]);
  const issues: CsharpStorageIssue[] = [];
  const reject = (node: Node, message: string): void => {
    issues.push(Object.freeze({ node, code: "CSHARP_NATIVE_BACKING_NOT_PROVEN", message }));
  };
  for (const { origin, layout } of evidence.pointerBackingDemands) {
    const layoutFile = policy.ast.getSourceFile(layout.call);
    const originFile = policy.ast.getSourceFile(origin.call);
    if (layoutFile === undefined || originFile === undefined) {
      reject(origin.call, "The native backing descriptor and origin require exact source files.");
      continue;
    }
    const selected = selectCsharpNativeMemoryLayout(policy, layout, layoutFile);
    if (selected === undefined) {
      reject(origin.call, "Physical backing requires an exact closed all-bit-pattern native layout.");
      continue;
    }
    if (origin.operation === "reinterpret") {
      const restored = selectCsharpRawLocation(policy, origin.call, originFile);
      if (restored?.kind !== "raw-location" || !csharpNativeMemoryLayoutsEqual(selected, restored.layout)) {
        reject(origin.call, "The reinterpreted location does not prove the demanded physical layout.");
      }
      continue;
    }
    const operation = operations.typedLocation(origin.call);
    if ((operation?.kind !== "location-allocate" && operation?.kind !== "location-address") ||
      !targetTypeRefEquals(selected.pointeeType, operation.pointeeType)) {
      reject(origin.call, "The physical storage origin and layout have different exact native value types.");
      continue;
    }
    let subject = origin.call;
    if (operation.kind === "location-address") {
      const storage = operation.storage;
      if (storage.kind === "reference-element-storage") {
        const component = evidence.closedArrayStorage(storage.expression);
        if (component.kind !== "closed") { reject(origin.call, component.reason); continue; }
        const subjects: [Node, CsharpNativeArrayStorage["kind"]][] = [
          ...component.declarations.map(node => [node, "binding"] as [Node, "binding"]),
          ...component.references.map(node => [node, "reference"] as [Node, "reference"]),
          ...component.literals.map(node => [node, "literal"] as [Node, "literal"]),
          ...component.elements.map(element => [element.expression, "element"] as [Node, "element"]),
        ];
        const valid = component.declarations.every(node => {
          const carrier = evidence.storageTargetType(node);
          return carrier?.kind === "array" && targetTypeRefEquals(carrier.element, selected.pointeeType);
        }) && component.elements.every(element => {
          const target = operations.element(element.expression);
          return target?.receiverType?.kind === "array" && targetTypeRefEquals(target.receiverType.element, selected.pointeeType);
        }) && subjects.every(([node]) => {
          const previous = arrays.get(node);
          return previous === undefined || previous.stride === layout.stride && csharpNativeMemoryLayoutsEqual(previous.layout, selected);
        });
        if (!valid) { reject(origin.call, "Native array aliases require one exact element carrier, stride and layout."); continue; }
        for (const [subject, kind] of subjects) arrays.set(subject, Object.freeze({ kind, layout: selected, stride: layout.stride }));
        continue;
      }
      if (storage.kind === "reference-property-storage") {
        const source = operations.property(storage.expression)?.sourceOwned;
        const shape = source?.objectShape;
        const member = source?.shapeMember?.kind === "resolved" ? source.shapeMember.member : undefined;
        if (shape === undefined || csharpStructuralObjectShapeIdentity(shape.targetType) === undefined ||
          member === undefined || member.memberKind !== "property" || member.readonly || member.optional ||
          member.accessor !== undefined || !targetTypeRefEquals(member.type, selected.pointeeType)) {
          reject(origin.call, "Native field backing requires one complete compiler-owned mutable data field.");
          continue;
        }
        const key = fieldKey(shape.targetType, member.targetName);
        const previous = fields.get(key);
        if (previous !== undefined && !csharpNativeMemoryLayoutsEqual(previous.layout, selected)) {
          reject(origin.call, "One exact object field has incompatible native layout requirements.");
          continue;
        }
        if (previous === undefined) {
          const used = new Set([...shape.members.map(field => field.targetName),
            ...[...fields.values()].filter(field => targetTypeRefEquals(field.owner, shape.targetType)).map(field => field.storageName)]);
          const base = `${member.targetName}Location`;
          let storageName = base;
          for (let suffix = 2; used.has(storageName); suffix += 1) storageName = `${base}_${suffix}`;
          fields.set(key, Object.freeze({ owner: shape.targetType, memberName: member.targetName, storageName, layout: selected }));
        }
        continue;
      }
      if (storage.kind !== "direct-storage" || storage.identity.kind !== "local-storage" ||
        (!policy.ast.is.IsVariableDeclaration(storage.identity.declaration) && !policy.ast.is.IsParameterDeclaration(storage.identity.declaration)) ||
        !policy.ast.is.IsIdentifier(storage.expression)) {
        reject(origin.call, "This addressable storage requires a native field, element, parameter or provider backing contract.");
        continue;
      }
      subject = storage.identity.declaration;
      if (policy.ast.is.IsParameterDeclaration(subject)) {
        const owner = policy.ast.parent(subject);
        if (owner === undefined || (!policy.ast.is.IsFunctionDeclaration(owner) && !policy.ast.is.IsMethodDeclaration(owner)) ||
          policy.ast.body(owner) === undefined || !policy.ast.is.IsIdentifier(policy.ast.name(subject))) {
          reject(origin.call, "Native parameter backing requires an exact by-value source function or method parameter.");
          continue;
        }
      } else {
        const list = policy.ast.parent(subject);
        const statement = list === undefined ? undefined : policy.ast.parent(list);
        const container = statement === undefined ? undefined : policy.ast.parent(statement);
        if (statement === undefined || !policy.ast.is.IsVariableStatement(statement) ||
          container === undefined || !policy.ast.is.IsBlock(container) ||
          policy.ast.as.AsVariableDeclaration(subject)?.Initializer === undefined) {
          reject(origin.call, "Native local backing requires an initialized block-local binding.");
          continue;
        }
      }
    }
    const previous = backings.get(subject);
    if (previous !== undefined && !csharpNativeMemoryLayoutsEqual(previous, selected)) {
      reject(origin.call, "One exact storage declaration has incompatible native layout requirements.");
    } else backings.set(subject, selected);
  }
  return Object.freeze({ issues: Object.freeze(issues),
    arrays: Object.freeze([...arrays].map(([subject, storage]) => Object.freeze({ subject, storage }))),
    array: (node: Node) => arrays.get(node),
    fields: Object.freeze([...fields.values()]),
    field: (owner: TargetTypeRef, name: string) => fields.get(fieldKey(owner, name)),
    entries: Object.freeze([...backings].map(([subject, layout]) => Object.freeze({ subject, layout }))),
    get: (subject: Node) => backings.get(subject) });
}

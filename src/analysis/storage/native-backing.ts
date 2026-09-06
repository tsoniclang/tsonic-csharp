import type { Node } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../policy/context.js";
import { selectCsharpNativeMemoryLayout, selectCsharpRawLocation } from "../../policy/operations/pointers/native-memory.js";
import type { CsharpNativeMemoryLayout } from "../../target-model/operations/native-memory.js";
import { csharpNativeMemoryLayoutsEqual } from "../../target-model/operations/native-memory.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import type { CsharpSourceEvidenceIndex } from "../source-evidence/index.js";
import type { CsharpTargetOperationClassifications } from "../operations/index.js";
import type { CsharpStorageIssue } from "./model.js";

export function analyzeCsharpNativeBacking(
  policy: CsharpPolicyContext, evidence: CsharpSourceEvidenceIndex,
  operations: CsharpTargetOperationClassifications,
) {
  const backings = new Map<Node, CsharpNativeMemoryLayout>();
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
    const selected = selectCsharpNativeMemoryLayout(policy.types, layout, layoutFile);
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
    entries: Object.freeze([...backings].map(([subject, layout]) => Object.freeze({ subject, layout }))),
    get: (subject: Node) => backings.get(subject) });
}

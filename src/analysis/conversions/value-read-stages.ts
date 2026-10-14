import type { Node } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type {
  CsharpValueRead,
  CsharpValueReadClassifications,
  CsharpValueReadStageIndex,
  CsharpValueReadStages,
} from "../../target-model/records/conversions.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/source-evidence.js";
import type { CsharpStorageRepresentationClassifications } from "../../target-model/records/storage.js";
import type { TargetTypeRef } from "../../target-model/types/index.js";

export interface CsharpValueReadStageAnalysis {
  readonly valueReadStages: CsharpValueReadStageIndex;
  /** Adds the selected storage representation once and publishes the sealed stages. */
  seal(storage: Pick<CsharpStorageRepresentationClassifications, "storageType">): CsharpValueReadClassifications;
}

/**
 * Reads every type stage of every source node once, after operation selection, and records the
 * selections each consumer asks for. Sealing adds the storage stage once. Consumers read the selection
 * they mean; none of them re-selects among stages.
 */
export function analyzeCsharpValueReadStages(
  policy: CsharpPolicyContext,
  evidence: CsharpSourceEvidenceIndex,
  operations: CsharpTargetOperationClassifications,
): CsharpValueReadStageAnalysis {
  const stages = new WeakMap<Node, CsharpValueReadStages>();
  for (const sourceFile of policy.sourceFiles) visitStages(sourceFile);
  let sealed: CsharpValueReadClassifications | undefined;
  return Object.freeze({
    valueReadStages: Object.freeze({ get: (node: Node) => stages.get(node) }),
    seal(storage: Pick<CsharpStorageRepresentationClassifications, "storageType">): CsharpValueReadClassifications {
      if (sealed !== undefined) return sealed;
      const reads = new WeakMap<Node, CsharpValueRead>();
      const visitReads = (node: Node): void => {
        const read = sealedValueRead(stages.get(node), storage.storageType.get(node));
        if (read !== undefined) reads.set(node, read);
        policy.ast.forEachChild(node, child => { if (child !== undefined) visitReads(child); });
      };
      for (const sourceFile of policy.sourceFiles) visitReads(sourceFile);
      sealed = Object.freeze({ valueRead: Object.freeze({ get: (node: Node) => reads.get(node) }) });
      return sealed;
    },
  });

  function visitStages(node: Node): void {
    const read = valueReadStages(node);
    if (read !== undefined) stages.set(node, read);
    policy.ast.forEachChild(node, child => { if (child !== undefined) visitStages(child); });
  }

  function valueReadStages(node: Node): CsharpValueReadStages | undefined {
    const source = evidence.nodeTargetType.get(node);
    const declaredStorage = evidence.storageTargetType.get(node);
    const readStorage = evidence.readStorageTargetType.get(node);
    const selectedOperation = operations.operationResultType.get(node);
    const narrowedRead = evidence.valueRefinement.get(node)?.flowReadTargetType;
    const member = operations.sourceMember.get(node);
    const selectedMemberRead = member?.selectedReadType;
    const selectedMemberStorage = member === undefined ? undefined
      : member.runtimeUnionProperty.kind === "resolved" ? member.runtimeUnionProperty.resultType : member.rawReadType;
    if (source === undefined && declaredStorage === undefined && readStorage === undefined &&
      selectedOperation === undefined && narrowedRead === undefined && selectedMemberRead === undefined &&
      selectedMemberStorage === undefined) return undefined;
    return Object.freeze(definedStages<CsharpValueReadStages>({
      source,
      declaredStorage,
      readStorage,
      selectedOperation,
      narrowedRead,
      selectedMemberRead,
      selectedMemberStorage,
      returnedValue: selectedOperation ?? readStorage ?? source,
      literalTarget: selectedOperation ?? declaredStorage ?? source,
      operationValue: selectedOperation ?? source,
      assertedValue: selectedOperation ?? narrowedRead ?? source,
    }));
  }
}

function sealedValueRead(
  stages: CsharpValueReadStages | undefined,
  storage: TargetTypeRef | undefined,
): CsharpValueRead | undefined {
  if (stages === undefined && storage === undefined) return undefined;
  const value = stages?.narrowedRead ?? stages?.selectedOperation ?? storage ?? stages?.source;
  const readStorageValue = storage ?? stages?.readStorage;
  return Object.freeze(definedStages<CsharpValueRead>({
    ...stages,
    storage,
    storedValue: storage ?? stages?.source,
    value,
    readStorageValue,
    flowReadValue: stages?.selectedMemberRead ?? value,
    flowReadStorage: stages?.selectedMemberStorage ?? readStorageValue,
  }));
}

function definedStages<Stages extends object>(
  stages: { readonly [Key in keyof Stages]?: Stages[Key] | undefined },
): Stages {
  const defined: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(stages)) if (value !== undefined) defined[key] = value;
  return defined as Stages;
}

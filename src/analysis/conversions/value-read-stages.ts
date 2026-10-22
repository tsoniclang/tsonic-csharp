import { createCsharpValueReadProducer } from "../program/records/value-reads.js";
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
import { getCsharpGeneratorProtocol } from "../../target-model/types/carriers/generators.js";

export interface CsharpValueReadStageAnalysis {
  readonly valueReadStages: CsharpValueReadStageIndex;
  seal(storage: Pick<CsharpStorageRepresentationClassifications, "storageType">): CsharpValueReadClassifications;
}

interface CsharpRawValueReadStages {
  readonly source: TargetTypeRef | undefined;
  readonly declaredStorage: TargetTypeRef | undefined;
  readonly readStorage: TargetTypeRef | undefined;
  readonly selectedOperation: TargetTypeRef | undefined;
  readonly narrowedRead: TargetTypeRef | undefined;
  readonly selectedMemberRead: TargetTypeRef | undefined;
  readonly selectedMemberStorage: TargetTypeRef | undefined;
}

export function analyzeCsharpValueReadStages(
  policy: CsharpPolicyContext,
  evidence: CsharpSourceEvidenceIndex,
  operations: CsharpTargetOperationClassifications,
): CsharpValueReadStageAnalysis {
  const rawStages = new WeakMap<Node, CsharpRawValueReadStages>();
  const producer = createCsharpValueReadProducer();
  const nodes: Node[] = [];
  for (const sourceFile of policy.sourceFiles) visitStages(sourceFile);
  let sealed: CsharpValueReadClassifications | undefined;
  return Object.freeze({
    valueReadStages: producer.sealStages(),
    seal(storage: Pick<CsharpStorageRepresentationClassifications, "storageType">): CsharpValueReadClassifications {
      if (sealed !== undefined) return sealed;
      for (const node of nodes) {
        const read = sealedValueRead(rawStages.get(node), storage.storageType.get(node));
        if (read !== undefined) producer.read(node, read);
      }
      sealed = producer.sealReads();
      return sealed;
    },
  });

  function visitStages(node: Node): void {
    nodes.push(node);
    const raw = rawValueReadStages(node);
    if (raw !== undefined) {
      rawStages.set(node, raw);
      const selected = preStorageValueRead(raw);
      if (selected !== undefined) producer.stage(node, selected);
    }
    policy.ast.forEachChild(node, child => { if (child !== undefined) visitStages(child); });
  }

  function rawValueReadStages(node: Node): CsharpRawValueReadStages | undefined {
    const source = evidence.nodeTargetType.get(node);
    const declaredStorage = evidence.storageTargetType.get(node);
    const readStorage = evidence.readStorageTargetType.get(node);
    const selectedOperation = operations.operationResultType.get(node) ?? yieldResumeType(node);
    const narrowedRead = evidence.valueRefinement.get(node)?.flowReadTargetType;
    const member = operations.sourceMember.get(node);
    const selectedMemberRead = member?.selectedReadType;
    const selectedMemberStorage = member === undefined ? undefined
      : member.runtimeUnionProperty.kind === "resolved" ? member.runtimeUnionProperty.resultType : member.rawReadType;
    if (source === undefined && declaredStorage === undefined && readStorage === undefined &&
      selectedOperation === undefined && narrowedRead === undefined && selectedMemberRead === undefined &&
      selectedMemberStorage === undefined) return undefined;
    return Object.freeze({
      source, declaredStorage, readStorage, selectedOperation, narrowedRead, selectedMemberRead, selectedMemberStorage,
    });
  }

  // A yield expression evaluates to the value its generator is resumed with: the sealed protocol next type, or the
  // delegated generator's return type for yield*. The checked source type of the expression loses authored numeric
  // aliases (an int TNext reads as number), so it never decides the resumed carrier.
  function yieldResumeType(node: Node): TargetTypeRef | undefined {
    const yielded = evidence.yield.get(node);
    if (yielded === undefined) return undefined;
    const protocol = getCsharpGeneratorProtocol(yielded.yieldKind === "delegate"
      ? evidence.yieldTargetType.get(node) : evidence.generatorTargetType.get(yielded.generator.declaration));
    return yielded.yieldKind === "delegate" ? protocol?.returnType : protocol?.nextType;
  }
}

function preStorageValueRead(raw: CsharpRawValueReadStages): CsharpValueReadStages | undefined {
  const returnedValue = raw.selectedOperation ?? raw.readStorage ?? raw.source;
  const literalTarget = raw.selectedOperation ?? raw.declaredStorage ?? raw.source;
  const operationValue = raw.selectedOperation ?? raw.source;
  if (returnedValue === undefined && literalTarget === undefined) return undefined;
  return Object.freeze({
    ...(returnedValue === undefined ? {} : { returnedValue }),
    ...(literalTarget === undefined ? {} : { literalTarget }),
    ...(operationValue === undefined ? {} : { operationValue }),
  });
}

function sealedValueRead(
  raw: CsharpRawValueReadStages | undefined,
  storage: TargetTypeRef | undefined,
): CsharpValueRead | undefined {
  if (raw === undefined && storage === undefined) return undefined;
  const source = raw?.source;
  const selectedOperation = raw?.selectedOperation;
  const narrowedRead = raw?.narrowedRead;
  const assertedValue = selectedOperation ?? narrowedRead ?? source;
  const storedValue = storage ?? source;
  const value = narrowedRead ?? selectedOperation ?? storage ?? source;
  const readStorageValue = storage ?? raw?.readStorage;
  const flowReadValue = raw?.selectedMemberRead ?? value;
  const flowReadStorage = raw?.selectedMemberStorage ?? readStorageValue;
  return Object.freeze({
    ...(source === undefined ? {} : { source }),
    ...(selectedOperation === undefined ? {} : { selectedOperation }),
    ...(narrowedRead === undefined ? {} : { narrowedRead }),
    ...(storage === undefined ? {} : { storage }),
    ...(assertedValue === undefined ? {} : { assertedValue }),
    ...(storedValue === undefined ? {} : { storedValue }),
    ...(value === undefined ? {} : { value }),
    ...(readStorageValue === undefined ? {} : { readStorageValue }),
    ...(flowReadValue === undefined ? {} : { flowReadValue }),
    ...(flowReadStorage === undefined ? {} : { flowReadStorage }),
  });
}

import { createCsharpValueReadProducer } from "../program/records/storage/value-reads.js";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { Node } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type {
  CsharpValueRead,
  CsharpValueReadClassifications,
  CsharpValueReadStageIndex,
  CsharpValueReadStages,
} from "../../target-model/records/operations/conversions.js";
import type { CsharpOperationIssue, CsharpTargetOperationClassifications } from "../../target-model/records/operations/operations.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/program/source-evidence.js";
import type { CsharpStorageRepresentationClassifications } from "../../target-model/records/storage/storage.js";
import type { TargetTypeRef } from "../../target-model/types/index.js";
import { getCsharpGeneratorProtocol } from "../../target-model/types/carriers/generators.js";
import { selectCsharpExactLiteralConversion, selectCsharpScalarLiteralCarrier } from "../../policy/conversions/literals.js";
import { getCsharpNullableElementTargetType, getCsharpRuntimeUnionArms } from "../../target-model/types/index.js";
import { representCsharpSourceType } from "../../policy/types/source-type-flow/representation.js";

export interface CsharpValueReadStageAnalysis {
  readonly issues: readonly CsharpOperationIssue[];
  readonly valueReadStages: CsharpValueReadStageIndex;
  seal(storage: Pick<CsharpStorageRepresentationClassifications, "storageType">): CsharpValueReadClassifications;
}

interface CsharpRawValueReadStages {
  readonly literalConstruction: boolean;
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
  const issues: CsharpOperationIssue[] = [];
  const nodes: Node[] = [];
  for (const sourceFile of policy.sourceFiles) visitStages(sourceFile);
  let sealed: CsharpValueReadClassifications | undefined;
  return Object.freeze({
    issues: Object.freeze(issues),
    valueReadStages: producer.sealStages(),
    seal(storage: Pick<CsharpStorageRepresentationClassifications, "storageType">): CsharpValueReadClassifications {
      if (sealed !== undefined) return sealed;
      for (const node of nodes) {
        const read = sealedValueRead(node, rawStages.get(node), storage.storageType.get(node));
        if (read !== undefined) producer.read(node, read);
      }
      sealed = producer.sealReads();
      return sealed;
    },
  });

  function visitStages(node: Node): void {
    nodes.push(node);
    policy.ast.forEachChild(node, child => { if (child !== undefined) visitStages(child); });
    const raw = rawValueReadStages(node);
    if (raw !== undefined) {
      rawStages.set(node, raw);
      const selected = preStorageValueRead(raw);
      if (selected !== undefined) producer.stage(node, selected);
    }
  }

  function rawValueReadStages(node: Node): CsharpRawValueReadStages | undefined {
    const source = evidence.nodeTargetType.get(node);
    const declaredStorage = evidence.storageTargetType.get(node);
    const readStorage = evidence.readStorageTargetType.get(node);
    const literal = policy.literalValues.literalValue.get(node);
    const literalConstruction = source !== undefined && literal !== undefined && literal.form !== "array";
    let selectedOperation: TargetTypeRef | undefined;
    if (literalConstruction && (literal.form === "parenthesized" || literal.form === "binary")) {
      const outcome = policy.effectiveTypes.get(node);
      const physical = outcome === undefined || outcome.kind === "refused" ? undefined : outcome.construction ??
        (outcome.type.kind === "primitive" || outcome.type.kind === "string" || outcome.type.kind === "intrinsic" &&
          (outcome.type.intrinsic === "bigint" || outcome.type.intrinsic === "absence") ? outcome.type : undefined);
      selectedOperation = physical === undefined ? undefined
        : representCsharpSourceType(policy.types.sourceTypeFlowRepresentation(node), physical);
    } else if (literalConstruction) {
      const parent = policy.ast.parent(node);
      const authored = parent !== undefined && policy.ast.is.IsPrefixUnaryExpression(parent) &&
        policy.literalValues.literalValue.get(parent) !== undefined ? parent : node;
      const authoredSource = authored === node ? source : evidence.nodeTargetType.get(authored);
      const present = getCsharpNullableElementTargetType(authoredSource) ?? authoredSource;
      const arms = getCsharpRuntimeUnionArms(present, policy.typeDefinitions);
      selectedOperation = arms === undefined ? present
        : selectCsharpScalarLiteralCarrier(policy.literalValues.literalValue.get(authored), present, policy.typeDefinitions);
      if (selectedOperation === undefined && authored === node && arms !== undefined) {
        const rejection = arms.map(arm => selectCsharpExactLiteralConversion(literal, arm, arm))
          .find(selection => selection.kind === "rejected");
        issues.push(Object.freeze({ node, code: "CSHARP_UNSUPPORTED_AST", message: rejection?.kind === "rejected"
          ? rejection.reason : "The source literal has no admitted physical C# union arm." }));
      }
    } else selectedOperation = operations.operationResultType.get(node) ?? yieldResumeType(node);
    const narrowedRead = evidence.valueRefinement.get(node)?.flowReadTargetType;
    const member = operations.sourceMember.get(node);
    const selectedMemberRead = member?.selectedReadType;
    const selectedMemberStorage = member === undefined ? undefined
      : member.runtimeUnionProperty.kind === "resolved" ? member.runtimeUnionProperty.resultType : member.rawReadType;
    if (source === undefined && declaredStorage === undefined && readStorage === undefined &&
      selectedOperation === undefined && narrowedRead === undefined && selectedMemberRead === undefined &&
      selectedMemberStorage === undefined) return undefined;
    return Object.freeze({
      literalConstruction, source, declaredStorage, readStorage, selectedOperation, narrowedRead, selectedMemberRead, selectedMemberStorage,
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
  node: Node,
  raw: CsharpRawValueReadStages | undefined,
  storage: TargetTypeRef | undefined,
): CsharpValueRead | undefined {
  if (raw === undefined && storage === undefined) return undefined;
  const source = raw?.source;
  const selectedOperation = raw?.selectedOperation;
  const narrowedRead = raw?.narrowedRead;
  const assertedValue = selectedOperation ?? narrowedRead ?? source;
  const storedValue = storage ?? source;
  const value = raw?.literalConstruction ? selectedOperation : narrowedRead ?? selectedOperation ?? storage ?? source;
  if (raw?.literalConstruction && value === undefined) failTargetAnalysisInvariant("tsonic-csharp",
    "A literal construction requires its completed physical carrier before value reads are sealed.", node);
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

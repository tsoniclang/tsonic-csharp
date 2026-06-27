import {
  booleanTargetMemberIdentityIndex,
} from "../../booleans.js";
import {
  consoleTargetMembersBySourceIdentity,
} from "../../console.js";
import {
  jsonTargetMemberIdentityIndex,
} from "../../json.js";
import {
  mathTargetMemberIdentityIndex,
} from "../../math.js";
import {
  numberTargetMemberIdentityIndex,
} from "../../numbers.js";
import {
  objectTargetMemberIdentityIndex,
} from "../../objects.js";
import {
  regExpTargetMemberIdentityIndex,
} from "../../regexp/index.js";
import {
  stringTargetMemberIdentityIndex,
} from "../../strings.js";
import {
  arrayConstructorIdentityPolicy,
  collectionConstructorIdentityPolicy,
  collectionIdentityPolicy,
  objectToStringIdentityPolicy,
} from "./identities.js";
import {
  objectRecordDictionaryCallRows,
} from "./object-members.js";
import {
  metadataIndexProvider,
  operationRowFromMetadataIndex,
  runtimeHelperProvider,
  selectedMetadataProvider,
  semanticExceptionProvider,
} from "./operation-providers.js";
import type {
  JsSurfaceOperationRow,
} from "./operation-types.js";

const selectedSignatureProviderFacts = [
  "selected source declaration/signature identity",
  "closed receiver and argument target facts required by the selected metadata row",
  "provider/runtime target member metadata row",
] as const;

export const jsSurfaceOperationRows: readonly JsSurfaceOperationRow[] = [
  operationRowFromMetadataIndex({ prefixes: ["Math."] }, mathTargetMemberIdentityIndex, { capabilityId: "surface.js.math", requiredFacts: selectedSignatureProviderFacts }),
  operationRowFromMetadataIndex({ prefixes: ["String."] }, stringTargetMemberIdentityIndex, { capabilityId: "surface.js.string-methods", requiredFacts: selectedSignatureProviderFacts }),
  operationRowFromMetadataIndex({ prefixes: ["Number."] }, numberTargetMemberIdentityIndex, { capabilityId: "surface.js.number-methods", requiredFacts: selectedSignatureProviderFacts }),
  operationRowFromMetadataIndex({ prefixes: ["Boolean."] }, booleanTargetMemberIdentityIndex, { capabilityId: "surface.js.boolean-methods", requiredFacts: selectedSignatureProviderFacts }),
  operationRowFromMetadataIndex({ prefixes: ["RegExp."] }, regExpTargetMemberIdentityIndex, { capabilityId: "surface.js.math-json-regexp", requiredFacts: selectedSignatureProviderFacts }),
  {
    identity: { prefixes: ["Date."] },
    policyKind: "semantic-exception",
    semanticException: {
      reason: "Date call and construct source operations have different JavaScript runtime semantics but share the Date source family.",
      requiredFacts: ["selected source declaration/signature identity", "call expression construct-vs-call shape"],
    },
    targetProviders: [semanticExceptionProvider({ kind: "date-call-construct" })],
  },
  operationRowFromMetadataIndex({ ids: ["JSON.parse"] }, jsonTargetMemberIdentityIndex, { capabilityId: "surface.js.math-json-regexp", requiredFacts: selectedSignatureProviderFacts }),
  {
    identity: { ids: ["JSON.stringify"] },
    policyKind: "runtime-helper",
    capabilityId: "surface.js.math-json-regexp",
    requiredFacts: selectedSignatureProviderFacts,
    targetProviders: [
      metadataIndexProvider(jsonTargetMemberIdentityIndex),
      runtimeHelperProvider({ kind: "record-dictionary-json-stringify" }),
    ],
  },
  {
    identity: objectToStringIdentityPolicy,
    policyKind: "semantic-exception",
    semanticException: {
      reason: "Object.prototype.toString delegates primitive receivers to selected JS wrapper surface members.",
      requiredFacts: ["selected source declaration/signature identity", "resolved primitive receiver carrier"],
      capabilityId: "surface.js.object-runtime",
    },
    targetProviders: [semanticExceptionProvider({ kind: "object-primitive-receiver-to-string" })],
  },
  ...objectRecordDictionaryCallRows.map((row): JsSurfaceOperationRow => ({
    identity: row.identity,
    policyKind: "runtime-helper",
    capabilityId: "surface.js.object-runtime",
    requiredFacts: ["selected source declaration/signature identity", "closed object-helper argument carrier", "Tsonic.CSharp.Js.Object runtime helper metadata row"],
    targetProviders: [
      metadataIndexProvider(objectTargetMemberIdentityIndex),
      runtimeHelperProvider({ kind: "record-dictionary", operation: row.operation }),
    ],
  })),
  operationRowFromMetadataIndex({ prefixes: ["Object."] }, objectTargetMemberIdentityIndex, { capabilityId: "surface.js.object-runtime", requiredFacts: selectedSignatureProviderFacts }),
  {
    identity: arrayConstructorIdentityPolicy,
    policyKind: "carrier-member",
    callableWithoutContext: true,
    targetProviders: [selectedMetadataProvider({ kind: "closed-sequence", requireResultElementType: true })],
  },
  {
    identity: { prefixes: ["Array.", "ReadonlyArray."] },
    policyKind: "carrier-member",
    targetProviders: [selectedMetadataProvider({ kind: "closed-sequence", requireResultElementType: false })],
  },
  {
    identity: collectionConstructorIdentityPolicy,
    policyKind: "carrier-member",
    targetProviders: [selectedMetadataProvider({ kind: "closed-keyed-collection", useResultCarrier: true })],
  },
  {
    identity: collectionIdentityPolicy,
    policyKind: "carrier-member",
    targetProviders: [selectedMetadataProvider({ kind: "closed-keyed-collection", useResultCarrier: false })],
  },
  {
    identity: { prefixes: ["Console."] },
    policyKind: "provider-member",
    capabilityId: "surface.js.console",
    requiredFacts: selectedSignatureProviderFacts,
    targetProviders: [metadataIndexProvider(consoleTargetMembersBySourceIdentity)],
  },
  {
    identity: { prefixes: ["Promise."] },
    policyKind: "unsupported",
    unsupported: {
      reason: "Promise source operations require explicit Promise/Task carrier, scheduler, and async continuation facts before C# emission.",
      requiredFacts: [
        "selected Promise source declaration/signature identity",
        "closed Promise result carrier",
        "target async runtime/scheduler operation metadata",
      ],
      capabilityId: "diagnostic.unsupported-selected-surface-operation",
    },
  },
];

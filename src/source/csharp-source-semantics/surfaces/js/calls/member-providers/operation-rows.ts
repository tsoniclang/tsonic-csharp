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
  carrierMemberProvider,
  metadataIndexProvider,
  operationRowFromMetadataIndex,
  runtimeHelperProvider,
  semanticExceptionProvider,
} from "./operation-providers.js";
import type {
  JsSurfaceOperationRow,
} from "./operation-types.js";

export const jsSurfaceOperationRows: readonly JsSurfaceOperationRow[] = [
  operationRowFromMetadataIndex({ prefixes: ["Math."] }, mathTargetMemberIdentityIndex),
  operationRowFromMetadataIndex({ prefixes: ["String."] }, stringTargetMemberIdentityIndex),
  operationRowFromMetadataIndex({ prefixes: ["Number."] }, numberTargetMemberIdentityIndex),
  operationRowFromMetadataIndex({ prefixes: ["Boolean."] }, booleanTargetMemberIdentityIndex),
  operationRowFromMetadataIndex({ prefixes: ["RegExp."] }, regExpTargetMemberIdentityIndex),
  {
    identity: { prefixes: ["Date."] },
    policyKind: "semantic-exception",
    semanticException: {
      reason: "Date call and construct source operations have different JavaScript runtime semantics but share the Date source family.",
      requiredFacts: ["selected source declaration/signature identity", "call expression construct-vs-call shape"],
    },
    targetProviders: [semanticExceptionProvider({ kind: "date-call-construct" })],
  },
  operationRowFromMetadataIndex({ prefixes: ["JSON."] }, jsonTargetMemberIdentityIndex),
  {
    identity: objectToStringIdentityPolicy,
    policyKind: "semantic-exception",
    semanticException: {
      reason: "Object.prototype.toString delegates primitive receivers to selected JS wrapper surface members.",
      requiredFacts: ["selected source declaration/signature identity", "resolved primitive receiver carrier"],
    },
    targetProviders: [semanticExceptionProvider({ kind: "object-primitive-receiver-to-string" })],
  },
  ...objectRecordDictionaryCallRows.map((row): JsSurfaceOperationRow => ({
    identity: row.identity,
    policyKind: "runtime-helper",
    targetProviders: [
      metadataIndexProvider(objectTargetMemberIdentityIndex),
      runtimeHelperProvider({ kind: "record-dictionary", operation: row.operation }),
    ],
  })),
  operationRowFromMetadataIndex({ prefixes: ["Object."] }, objectTargetMemberIdentityIndex),
  {
    identity: arrayConstructorIdentityPolicy,
    policyKind: "carrier-member",
    callableWithoutContext: true,
    targetProviders: [carrierMemberProvider({ kind: "sequence", requireResultElementType: true })],
  },
  {
    identity: { prefixes: ["Array.", "ReadonlyArray."] },
    policyKind: "carrier-member",
    targetProviders: [carrierMemberProvider({ kind: "sequence", requireResultElementType: false })],
  },
  {
    identity: collectionConstructorIdentityPolicy,
    policyKind: "carrier-member",
    targetProviders: [carrierMemberProvider({ kind: "keyed-collection", useResultCarrier: true })],
  },
  {
    identity: collectionIdentityPolicy,
    policyKind: "carrier-member",
    targetProviders: [carrierMemberProvider({ kind: "keyed-collection", useResultCarrier: false })],
  },
  {
    identity: { prefixes: ["Console."] },
    policyKind: "provider-member",
    targetProviders: [metadataIndexProvider(consoleTargetMembersBySourceIdentity)],
  },
  {
    identity: { prefixes: ["Promise."] },
    policyKind: "unsupported",
  },
];

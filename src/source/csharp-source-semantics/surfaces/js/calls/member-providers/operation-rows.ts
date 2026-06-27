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
  callConstructDiscriminatorProvider,
  closedKeyedCollectionCarrierProvider,
  closedSequenceCarrierProvider,
  metadataIndexProvider,
  operationAdapterProvider,
  operationRowFromMetadataIndex,
  primitiveReceiverStaticHelperProvider,
  recordDictionaryStaticHelperProvider,
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
    targetProviders: [operationAdapterProvider(callConstructDiscriminatorProvider())],
  },
  operationRowFromMetadataIndex({ prefixes: ["JSON."] }, jsonTargetMemberIdentityIndex),
  {
    identity: objectToStringIdentityPolicy,
    policyKind: "semantic-exception",
    semanticException: {
      reason: "Object.prototype.toString delegates primitive receivers to selected JS wrapper surface members.",
      requiredFacts: ["selected source declaration/signature identity", "resolved primitive receiver carrier"],
    },
    targetProviders: [operationAdapterProvider(primitiveReceiverStaticHelperProvider())],
  },
  ...objectRecordDictionaryCallRows.map((row): JsSurfaceOperationRow => ({
    identity: row.identity,
    policyKind: "carrier-member",
    targetProviders: [
      metadataIndexProvider(objectTargetMemberIdentityIndex),
      operationAdapterProvider(recordDictionaryStaticHelperProvider(row.operation)),
    ],
  })),
  operationRowFromMetadataIndex({ prefixes: ["Object."] }, objectTargetMemberIdentityIndex),
  {
    identity: arrayConstructorIdentityPolicy,
    policyKind: "carrier-member",
    callableWithoutContext: true,
    targetProviders: [operationAdapterProvider(closedSequenceCarrierProvider({ requireResultElementType: true }))],
  },
  {
    identity: { prefixes: ["Array.", "ReadonlyArray."] },
    policyKind: "carrier-member",
    targetProviders: [operationAdapterProvider(closedSequenceCarrierProvider({ requireResultElementType: false }))],
  },
  {
    identity: collectionConstructorIdentityPolicy,
    policyKind: "carrier-member",
    targetProviders: [operationAdapterProvider(closedKeyedCollectionCarrierProvider({ useResultCarrier: true }))],
  },
  {
    identity: collectionIdentityPolicy,
    policyKind: "carrier-member",
    targetProviders: [operationAdapterProvider(closedKeyedCollectionCarrierProvider({ useResultCarrier: false }))],
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

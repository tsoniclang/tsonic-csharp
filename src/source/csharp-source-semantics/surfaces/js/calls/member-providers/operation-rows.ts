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
import type {
  JsSurfaceSourceIdentitySelector,
} from "../../target-member-metadata.js";

const selectedSignatureProviderFacts = [
  "selected source declaration/signature identity",
  "closed receiver and argument target facts required by the selected metadata row",
  "provider/runtime target member metadata row",
] as const;

const arrayStaticCallIdentityPolicy = {
  ids: [
    "Array.from",
    "Array.of",
    "Array.isArray",
  ],
} as const satisfies JsSurfaceSourceIdentitySelector;
const arrayConcatIdentityPolicy = {
  ids: ["Array.concat", "ReadonlyArray.concat"],
} as const satisfies JsSurfaceSourceIdentitySelector;
const stringStaticCallIdentityPolicy = {
  ids: [
    "String.fromCharCode",
    "String.fromCodePoint",
  ],
} as const satisfies JsSurfaceSourceIdentitySelector;
const unsupportedStringExactSemanticsIdentityPolicy = {
  ids: [
    "String.raw",
    "String.match",
    "String.matchAll",
  ],
} as const satisfies JsSurfaceSourceIdentitySelector;
const numberStaticCallIdentityPolicy = {
  ids: [
    "Number.parseInt",
    "Number.parseFloat",
    "Number.isNaN",
    "Number.isFinite",
    "Number.isInteger",
    "Number.isSafeInteger",
  ],
} as const satisfies JsSurfaceSourceIdentitySelector;
const regexpConstructorIdentityPolicy = {
  ids: ["RegExp.constructor"],
} as const satisfies JsSurfaceSourceIdentitySelector;
const dateStaticCallIdentityPolicy = {
  ids: [
    "Date.constructor",
    "Date.now",
    "Date.parse",
    "Date.UTC",
  ],
} as const satisfies JsSurfaceSourceIdentitySelector;

export const jsSurfaceOperationRows: readonly JsSurfaceOperationRow[] = [
  operationRowFromMetadataIndex({ prefixes: ["Math."] }, mathTargetMemberIdentityIndex, { capabilityId: "surface.js.math", requiredFacts: selectedSignatureProviderFacts }),
  operationRowFromMetadataIndex(stringStaticCallIdentityPolicy, stringTargetMemberIdentityIndex, { capabilityId: "surface.js.string-methods", requiredFacts: selectedSignatureProviderFacts }),
  {
    identity: unsupportedStringExactSemanticsIdentityPolicy,
    policyKind: "unsupported",
    unsupported: {
      reason: "String.raw, String.prototype.match, and String.prototype.matchAll require closed template-object, RegExp coercion, RegExpMatchArray, iterator, group, and lastIndex semantics before C# emission.",
      requiredFacts: [
        "selected String source declaration/signature identity",
        "closed template-object or RegExp carrier facts",
        "RegExp match result and iterator carrier metadata",
        "runtime helper metadata proving ECMAScript String exactness",
      ],
      capabilityId: "surface.js.string-methods",
    },
  },
  {
    ...operationRowFromMetadataIndex({ prefixes: ["String."] }, stringTargetMemberIdentityIndex, { capabilityId: "surface.js.string-methods", requiredFacts: selectedSignatureProviderFacts }),
    closedFacts: { kind: "receiver", target: "string" },
  },
  operationRowFromMetadataIndex(numberStaticCallIdentityPolicy, numberTargetMemberIdentityIndex, { capabilityId: "surface.js.number-methods", requiredFacts: selectedSignatureProviderFacts }),
  {
    ...operationRowFromMetadataIndex({ prefixes: ["Number."] }, numberTargetMemberIdentityIndex, { capabilityId: "surface.js.number-methods", requiredFacts: selectedSignatureProviderFacts }),
    closedFacts: { kind: "receiver", target: "number" },
  },
  {
    ...operationRowFromMetadataIndex({ prefixes: ["Boolean."] }, booleanTargetMemberIdentityIndex, { capabilityId: "surface.js.boolean-methods", requiredFacts: selectedSignatureProviderFacts }),
    closedFacts: { kind: "receiver", target: "boolean" },
  },
  operationRowFromMetadataIndex(regexpConstructorIdentityPolicy, regExpTargetMemberIdentityIndex, { capabilityId: "surface.js.math-json-regexp", requiredFacts: selectedSignatureProviderFacts }),
  {
    ...operationRowFromMetadataIndex({ prefixes: ["RegExp."] }, regExpTargetMemberIdentityIndex, { capabilityId: "surface.js.math-json-regexp", requiredFacts: selectedSignatureProviderFacts }),
    closedFacts: { kind: "receiver", target: "regexp" },
  },
  {
    identity: dateStaticCallIdentityPolicy,
    policyKind: "semantic-exception",
    semanticException: {
      reason: "Date call and construct source operations have different JavaScript runtime semantics but share the Date source family.",
      requiredFacts: ["selected source declaration/signature identity", "call expression construct-vs-call shape"],
    },
    targetProviders: [semanticExceptionProvider({ kind: "date-call-construct" })],
  },
  {
    identity: { prefixes: ["Date."] },
    policyKind: "semantic-exception",
    closedFacts: { kind: "receiver", target: "date" },
    semanticException: {
      reason: "Date instance source operations require a closed Date runtime carrier before target emission.",
      requiredFacts: ["selected source declaration/signature identity", "closed Date receiver carrier"],
    },
    targetProviders: [semanticExceptionProvider({ kind: "date-call-construct" })],
  },
  operationRowFromMetadataIndex({ ids: ["JSON.parse"] }, jsonTargetMemberIdentityIndex, { capabilityId: "surface.js.math-json-regexp", requiredFacts: selectedSignatureProviderFacts }),
  {
    identity: { ids: ["JSON.stringify"] },
    policyKind: "runtime-helper",
    closedFacts: { kind: "arguments", conditions: [{ index: 0, target: "json-value" }] },
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
    closedFacts: { kind: "arguments", conditions: [
      { index: 0, target: "object-helper" },
    ] },
    capabilityId: "surface.js.object-runtime",
    requiredFacts: ["selected source declaration/signature identity", "closed object-helper argument carrier", "Tsonic.CSharp.Js.Object runtime helper metadata row"],
    targetProviders: [
      metadataIndexProvider(objectTargetMemberIdentityIndex),
      runtimeHelperProvider({ kind: "record-dictionary", operation: row.operation }),
    ],
  })),
  {
    ...operationRowFromMetadataIndex({ ids: ["Object.hasOwn"] }, objectTargetMemberIdentityIndex, { capabilityId: "surface.js.object-runtime", requiredFacts: selectedSignatureProviderFacts }),
    closedFacts: { kind: "arguments", conditions: [
      { index: 0, target: "object-helper" },
      { index: 1, target: "string" },
    ] },
  },
  {
    ...operationRowFromMetadataIndex({ ids: ["Object.assign"] }, objectTargetMemberIdentityIndex, { capabilityId: "surface.js.object-runtime", requiredFacts: selectedSignatureProviderFacts }),
    closedFacts: { kind: "arguments", conditions: [
      { index: 0, target: "js-object" },
      { fromIndex: 1, target: "object-helper" },
    ] },
  },
  {
    ...operationRowFromMetadataIndex({ ids: ["Object.hasOwnProperty"] }, objectTargetMemberIdentityIndex, { capabilityId: "surface.js.object-runtime", requiredFacts: selectedSignatureProviderFacts }),
    closedFacts: { kind: "receiver", target: "js-object" },
  },
  operationRowFromMetadataIndex({ prefixes: ["Object."] }, objectTargetMemberIdentityIndex, { capabilityId: "surface.js.object-runtime", requiredFacts: selectedSignatureProviderFacts }),
  {
    identity: arrayConstructorIdentityPolicy,
    policyKind: "carrier-member",
    callableWithoutContext: true,
    targetProviders: [selectedMetadataProvider({ kind: "closed-sequence", requireResultElementType: true })],
  },
  {
    identity: arrayStaticCallIdentityPolicy,
    policyKind: "carrier-member",
    targetProviders: [selectedMetadataProvider({ kind: "closed-sequence", requireResultElementType: false })],
  },
  {
    identity: arrayConcatIdentityPolicy,
    policyKind: "carrier-member",
    closedFacts: { kind: "all", requirements: [
      { kind: "receiver", target: "array-like" },
      { kind: "known-argument-targets" },
    ] },
    targetProviders: [selectedMetadataProvider({ kind: "closed-sequence", requireResultElementType: false })],
  },
  {
    identity: { prefixes: ["Array.", "ReadonlyArray."] },
    policyKind: "carrier-member",
    closedFacts: { kind: "receiver", target: "array-like" },
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
    closedFacts: { kind: "receiver", target: "selected-collection-carrier" },
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

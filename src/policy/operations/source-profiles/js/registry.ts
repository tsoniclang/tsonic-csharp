import type { CsharpSourceProfileCallPolicy, CsharpSourceProfileElementPolicy, CsharpSourceProfilePropertyPolicy } from "../../../model/source-profiles.js";
import { csharpJsArrayCallPolicies, csharpJsArrayElementPolicies, csharpJsArrayPropertyPolicies } from "./arrays.js";
import { csharpJsCollectionCallPolicies, csharpJsCollectionPropertyPolicies } from "./collections.js";
import { csharpJsDateCallPolicies } from "./date.js";
import { csharpJsRegExpCallPolicies, csharpJsRegExpElementPolicies, csharpJsRegExpPropertyPolicies } from "./regexp.js";
import { csharpJsGlobalCallPolicies, csharpJsGlobalPropertyPolicies } from "./globals.js";
import { csharpJsNumberCallPolicies, csharpJsNumberPropertyPolicies } from "./numbers.js";
import { csharpJsObjectCallPolicies } from "./objects.js";
import { csharpJsStringCallPolicies, csharpJsStringElementPolicies, csharpJsStringPropertyPolicies } from "./strings.js";
import { csharpJsWeakCollectionCallPolicies } from "./weak-collections.js";
import { csharpJsSymbolCallPolicies } from "./symbols.js";
import { csharpJsBinaryCallPolicies, csharpJsBinaryElementPolicies, csharpJsBinaryPropertyPolicies } from "./binary.js";
import { csharpJsPromiseCallPolicies } from "./promises.js";
import { csharpJsIntlCallPolicies, csharpJsIntlPropertyPolicies } from "./intl.js";
import { csharpJsBigIntCallPolicies } from "./bigints.js";

export const csharpJsSourceProfileCallPolicies:
  readonly CsharpSourceProfileCallPolicy[] = Object.freeze([
    ...csharpJsArrayCallPolicies,
    ...csharpJsCollectionCallPolicies,
    ...csharpJsDateCallPolicies,
    ...csharpJsRegExpCallPolicies.map(policy => Object.freeze({ ...policy,
      inputRequirements: Object.freeze({ ...policy.inputRequirements, regexpExecution: true as const }) })),
    ...csharpJsGlobalCallPolicies,
    ...csharpJsNumberCallPolicies,
    ...csharpJsObjectCallPolicies.map(policy => Object.freeze({ ...policy,
      inputRequirements: Object.freeze({ ...policy.inputRequirements, objectShapes: true as const }) })),
    ...csharpJsStringCallPolicies.map(policy => Object.freeze({ ...policy,
      inputRequirements: Object.freeze({ ...policy.inputRequirements, regexpProtocol: true as const }) })),
    ...csharpJsWeakCollectionCallPolicies,
    ...csharpJsSymbolCallPolicies,
    ...csharpJsBinaryCallPolicies,
    ...csharpJsPromiseCallPolicies.map(policy => Object.freeze({ ...policy,
      inputRequirements: Object.freeze({ ...policy.inputRequirements, sourceTypeRelations: true as const }) })),
    ...csharpJsIntlCallPolicies,
    ...csharpJsBigIntCallPolicies,
  ]);

export const csharpJsSourceProfilePropertyPolicies:
  readonly CsharpSourceProfilePropertyPolicy[] = Object.freeze([
    ...csharpJsArrayPropertyPolicies,
    ...csharpJsCollectionPropertyPolicies,
    ...csharpJsRegExpPropertyPolicies,
    ...csharpJsGlobalPropertyPolicies,
    ...csharpJsNumberPropertyPolicies,
    ...csharpJsStringPropertyPolicies,
    ...csharpJsBinaryPropertyPolicies,
    ...csharpJsIntlPropertyPolicies,
  ]);

export const csharpJsSourceProfileElementPolicies:
  readonly CsharpSourceProfileElementPolicy[] = Object.freeze([
    ...csharpJsArrayElementPolicies,
    ...csharpJsRegExpElementPolicies,
    ...csharpJsStringElementPolicies,
    ...csharpJsBinaryElementPolicies,
  ]);

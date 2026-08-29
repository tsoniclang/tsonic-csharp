import type {
  CsharpSourceProfileCallPolicy,
  CsharpSourceProfileElementPolicy,
  CsharpSourceProfilePropertyPolicy,
} from "../source-profile-policy.js";
import {
  csharpJsArrayCallPolicies,
  csharpJsArrayElementPolicies,
  csharpJsArrayPropertyPolicies,
} from "./arrays.js";
import {
  csharpJsCollectionCallPolicies,
  csharpJsCollectionElementPolicies,
  csharpJsCollectionPropertyPolicies,
} from "./collections.js";
import {
  csharpJsDateCallPolicies,
} from "./date.js";
import {
  csharpJsRegExpCallPolicies,
  csharpJsRegExpElementPolicies,
  csharpJsRegExpPropertyPolicies,
} from "./regexp.js";
import {
  csharpJsGlobalCallPolicies,
  csharpJsGlobalPropertyPolicies,
} from "./globals.js";
import {
  csharpJsNumberCallPolicies,
  csharpJsNumberPropertyPolicies,
} from "./numbers.js";
import {
  csharpJsObjectCallPolicies,
} from "./objects.js";
import {
  csharpJsStringCallPolicies,
  csharpJsStringElementPolicies,
  csharpJsStringPropertyPolicies,
} from "./strings.js";
import {
  csharpJsWeakCollectionCallPolicies,
} from "./weak-collections.js";
import { csharpJsSymbolCallPolicies } from "./symbols.js";
import {
  csharpJsBinaryCallPolicies,
  csharpJsBinaryElementPolicies,
  csharpJsBinaryPropertyPolicies,
} from "./binary.js";
import { csharpJsPromiseCallPolicies } from "./promises.js";
import {
  csharpJsIntlCallPolicies,
  csharpJsIntlPropertyPolicies,
} from "./intl.js";

export const csharpJsSourceProfileCallPolicies:
  readonly CsharpSourceProfileCallPolicy[] = Object.freeze([
    ...csharpJsArrayCallPolicies,
    ...csharpJsCollectionCallPolicies,
    ...csharpJsDateCallPolicies,
    ...csharpJsRegExpCallPolicies,
    ...csharpJsGlobalCallPolicies,
    ...csharpJsNumberCallPolicies,
    ...csharpJsObjectCallPolicies,
    ...csharpJsStringCallPolicies,
    ...csharpJsWeakCollectionCallPolicies,
    ...csharpJsSymbolCallPolicies,
    ...csharpJsBinaryCallPolicies,
    ...csharpJsPromiseCallPolicies,
    ...csharpJsIntlCallPolicies,
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
    ...csharpJsCollectionElementPolicies,
    ...csharpJsRegExpElementPolicies,
    ...csharpJsStringElementPolicies,
    ...csharpJsBinaryElementPolicies,
  ]);

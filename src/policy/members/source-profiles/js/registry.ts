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
  ]);

export const csharpJsSourceProfilePropertyPolicies:
  readonly CsharpSourceProfilePropertyPolicy[] = Object.freeze([
    ...csharpJsArrayPropertyPolicies,
    ...csharpJsCollectionPropertyPolicies,
    ...csharpJsRegExpPropertyPolicies,
    ...csharpJsGlobalPropertyPolicies,
    ...csharpJsNumberPropertyPolicies,
    ...csharpJsStringPropertyPolicies,
  ]);

export const csharpJsSourceProfileElementPolicies:
  readonly CsharpSourceProfileElementPolicy[] = Object.freeze([
    ...csharpJsArrayElementPolicies,
    ...csharpJsCollectionElementPolicies,
    ...csharpJsRegExpElementPolicies,
    ...csharpJsStringElementPolicies,
  ]);

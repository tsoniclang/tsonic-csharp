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
  csharpJsDateRegExpCallPolicies,
  csharpJsDateRegExpPropertyPolicies,
} from "./date-regexp.js";
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
    ...csharpJsDateRegExpCallPolicies,
    ...csharpJsGlobalCallPolicies,
    ...csharpJsNumberCallPolicies,
    ...csharpJsObjectCallPolicies,
    ...csharpJsStringCallPolicies,
  ]);

export const csharpJsSourceProfilePropertyPolicies:
  readonly CsharpSourceProfilePropertyPolicy[] = Object.freeze([
    ...csharpJsArrayPropertyPolicies,
    ...csharpJsCollectionPropertyPolicies,
    ...csharpJsDateRegExpPropertyPolicies,
    ...csharpJsGlobalPropertyPolicies,
    ...csharpJsNumberPropertyPolicies,
    ...csharpJsStringPropertyPolicies,
  ]);

export const csharpJsSourceProfileElementPolicies:
  readonly CsharpSourceProfileElementPolicy[] = Object.freeze([
    ...csharpJsArrayElementPolicies,
    ...csharpJsCollectionElementPolicies,
    ...csharpJsStringElementPolicies,
  ]);

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
  csharpJsDateRegExpCallPolicies,
  csharpJsDateRegExpPropertyPolicies,
} from "./date-regexp.js";
import {
  csharpJsCollectionCallPolicies,
  csharpJsCollectionElementPolicies,
  csharpJsCollectionPropertyPolicies,
} from "./collections.js";
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

export * from "./arrays.js";
export * from "./collections.js";
export * from "./date-regexp.js";
export * from "./globals.js";
export * from "./numbers.js";
export * from "./objects.js";
export * from "./strings.js";

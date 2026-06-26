import {
  targetParameter,
} from "../../source-library.js";
import type {
  JsSurfaceTargetMemberMetadata,
} from "../../target-member-metadata.js";
import {
  dateMethodMetadata,
  dateStaticMethodMetadata,
  optionalIntParameter,
} from "./builders.js";
import {
  dateTargetMemberTypes,
} from "./types.js";

const utcParameters = [
  targetParameter("year", dateTargetMemberTypes.intType),
  targetParameter("month", dateTargetMemberTypes.intType),
  targetParameter("day", dateTargetMemberTypes.intType, { optional: true }),
  targetParameter("hours", dateTargetMemberTypes.intType, { optional: true }),
  targetParameter("minutes", dateTargetMemberTypes.intType, { optional: true }),
  targetParameter("seconds", dateTargetMemberTypes.intType, { optional: true }),
  targetParameter("milliseconds", dateTargetMemberTypes.intType, { optional: true }),
];

const dateGetterNames = [
  "getFullYear",
  "getMonth",
  "getDate",
  "getDay",
  "getHours",
  "getMinutes",
  "getSeconds",
  "getMilliseconds",
  "getTimezoneOffset",
  "getUTCFullYear",
  "getUTCMonth",
  "getUTCDate",
  "getUTCDay",
  "getUTCHours",
  "getUTCMinutes",
  "getUTCSeconds",
  "getUTCMilliseconds",
] as const;

const dateStringMethodNames = [
  "toDateString",
  "toTimeString",
  "toISOString",
  "toUTCString",
  "toJSON",
  "toLocaleDateString",
  "toLocaleTimeString",
  "toLocaleString",
] as const;

export const dateTargetMemberMetadata = [
  dateStaticMethodMetadata("now", [], dateTargetMemberTypes.longType),
  dateStaticMethodMetadata("parse", [targetParameter("dateString", dateTargetMemberTypes.stringType)], dateTargetMemberTypes.doubleType),
  dateStaticMethodMetadata("UTC", utcParameters, dateTargetMemberTypes.doubleType),
  dateMethodMetadata("getTime", [], dateTargetMemberTypes.longType),
  dateMethodMetadata("valueOf", [], dateTargetMemberTypes.longType),
  dateMethodMetadata("toString", [], dateTargetMemberTypes.stringType, "ToString"),
  ...dateGetterNames.map((sourceName) => dateMethodMetadata(sourceName, [], dateTargetMemberTypes.intType)),
  ...dateStringMethodNames.map((sourceName) => dateMethodMetadata(sourceName, [], dateTargetMemberTypes.stringType)),
  dateMethodMetadata("setTime", [targetParameter("milliseconds", dateTargetMemberTypes.doubleType)], dateTargetMemberTypes.doubleType),
  dateMethodMetadata("setMilliseconds", [targetParameter("ms", dateTargetMemberTypes.intType)], dateTargetMemberTypes.doubleType),
  dateMethodMetadata("setSeconds", [
    targetParameter("sec", dateTargetMemberTypes.intType),
    optionalIntParameter("ms"),
  ], dateTargetMemberTypes.doubleType),
  dateMethodMetadata("setMinutes", [
    targetParameter("min", dateTargetMemberTypes.intType),
    optionalIntParameter("sec"),
    optionalIntParameter("ms"),
  ], dateTargetMemberTypes.doubleType),
  dateMethodMetadata("setHours", [
    targetParameter("hour", dateTargetMemberTypes.intType),
    optionalIntParameter("min"),
    optionalIntParameter("sec"),
    optionalIntParameter("ms"),
  ], dateTargetMemberTypes.doubleType),
  dateMethodMetadata("setDate", [targetParameter("day", dateTargetMemberTypes.intType)], dateTargetMemberTypes.doubleType),
  dateMethodMetadata("setMonth", [
    targetParameter("month", dateTargetMemberTypes.intType),
    optionalIntParameter("day"),
  ], dateTargetMemberTypes.doubleType),
  dateMethodMetadata("setFullYear", [
    targetParameter("year", dateTargetMemberTypes.intType),
    optionalIntParameter("month"),
    optionalIntParameter("day"),
  ], dateTargetMemberTypes.doubleType),
  dateMethodMetadata("setUTCMilliseconds", [targetParameter("ms", dateTargetMemberTypes.intType)], dateTargetMemberTypes.doubleType),
  dateMethodMetadata("setUTCSeconds", [
    targetParameter("sec", dateTargetMemberTypes.intType),
    optionalIntParameter("ms"),
  ], dateTargetMemberTypes.doubleType),
  dateMethodMetadata("setUTCMinutes", [
    targetParameter("min", dateTargetMemberTypes.intType),
    optionalIntParameter("sec"),
    optionalIntParameter("ms"),
  ], dateTargetMemberTypes.doubleType),
  dateMethodMetadata("setUTCHours", [
    targetParameter("hour", dateTargetMemberTypes.intType),
    optionalIntParameter("min"),
    optionalIntParameter("sec"),
    optionalIntParameter("ms"),
  ], dateTargetMemberTypes.doubleType),
  dateMethodMetadata("setUTCDate", [targetParameter("day", dateTargetMemberTypes.intType)], dateTargetMemberTypes.doubleType),
  dateMethodMetadata("setUTCMonth", [
    targetParameter("month", dateTargetMemberTypes.intType),
    optionalIntParameter("day"),
  ], dateTargetMemberTypes.doubleType),
  dateMethodMetadata("setUTCFullYear", [
    targetParameter("year", dateTargetMemberTypes.intType),
    optionalIntParameter("month"),
    optionalIntParameter("day"),
  ], dateTargetMemberTypes.doubleType),
] satisfies readonly JsSurfaceTargetMemberMetadata[];

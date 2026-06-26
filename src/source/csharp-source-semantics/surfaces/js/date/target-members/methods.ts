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

const dateStaticMethodRows = {
  now: { id: "Tsonic.CSharp.Js.Date.now", sourceName: "now", targetName: "now" },
  parse: { id: "Tsonic.CSharp.Js.Date.parse", sourceName: "parse", targetName: "parse" },
  UTC: { id: "Tsonic.CSharp.Js.Date.UTC", sourceName: "UTC", targetName: "UTC" },
};

const utcParameters = [
  targetParameter("year", dateTargetMemberTypes.intType),
  targetParameter("month", dateTargetMemberTypes.intType),
  targetParameter("day", dateTargetMemberTypes.intType, { optional: true }),
  targetParameter("hours", dateTargetMemberTypes.intType, { optional: true }),
  targetParameter("minutes", dateTargetMemberTypes.intType, { optional: true }),
  targetParameter("seconds", dateTargetMemberTypes.intType, { optional: true }),
  targetParameter("milliseconds", dateTargetMemberTypes.intType, { optional: true }),
];

const dateGetterRows = [
  { id: "Tsonic.CSharp.Js.Date.getFullYear", sourceName: "getFullYear", targetName: "getFullYear" },
  { id: "Tsonic.CSharp.Js.Date.getMonth", sourceName: "getMonth", targetName: "getMonth" },
  { id: "Tsonic.CSharp.Js.Date.getDate", sourceName: "getDate", targetName: "getDate" },
  { id: "Tsonic.CSharp.Js.Date.getDay", sourceName: "getDay", targetName: "getDay" },
  { id: "Tsonic.CSharp.Js.Date.getHours", sourceName: "getHours", targetName: "getHours" },
  { id: "Tsonic.CSharp.Js.Date.getMinutes", sourceName: "getMinutes", targetName: "getMinutes" },
  { id: "Tsonic.CSharp.Js.Date.getSeconds", sourceName: "getSeconds", targetName: "getSeconds" },
  { id: "Tsonic.CSharp.Js.Date.getMilliseconds", sourceName: "getMilliseconds", targetName: "getMilliseconds" },
  { id: "Tsonic.CSharp.Js.Date.getTimezoneOffset", sourceName: "getTimezoneOffset", targetName: "getTimezoneOffset" },
  { id: "Tsonic.CSharp.Js.Date.getUTCFullYear", sourceName: "getUTCFullYear", targetName: "getUTCFullYear" },
  { id: "Tsonic.CSharp.Js.Date.getUTCMonth", sourceName: "getUTCMonth", targetName: "getUTCMonth" },
  { id: "Tsonic.CSharp.Js.Date.getUTCDate", sourceName: "getUTCDate", targetName: "getUTCDate" },
  { id: "Tsonic.CSharp.Js.Date.getUTCDay", sourceName: "getUTCDay", targetName: "getUTCDay" },
  { id: "Tsonic.CSharp.Js.Date.getUTCHours", sourceName: "getUTCHours", targetName: "getUTCHours" },
  { id: "Tsonic.CSharp.Js.Date.getUTCMinutes", sourceName: "getUTCMinutes", targetName: "getUTCMinutes" },
  { id: "Tsonic.CSharp.Js.Date.getUTCSeconds", sourceName: "getUTCSeconds", targetName: "getUTCSeconds" },
  { id: "Tsonic.CSharp.Js.Date.getUTCMilliseconds", sourceName: "getUTCMilliseconds", targetName: "getUTCMilliseconds" },
] as const;

const dateStringMethodRows = [
  { id: "Tsonic.CSharp.Js.Date.toDateString", sourceName: "toDateString", targetName: "toDateString" },
  { id: "Tsonic.CSharp.Js.Date.toTimeString", sourceName: "toTimeString", targetName: "toTimeString" },
  { id: "Tsonic.CSharp.Js.Date.toISOString", sourceName: "toISOString", targetName: "toISOString" },
  { id: "Tsonic.CSharp.Js.Date.toUTCString", sourceName: "toUTCString", targetName: "toUTCString" },
  { id: "Tsonic.CSharp.Js.Date.toJSON", sourceName: "toJSON", targetName: "toJSON" },
  { id: "Tsonic.CSharp.Js.Date.toLocaleDateString", sourceName: "toLocaleDateString", targetName: "toLocaleDateString" },
  { id: "Tsonic.CSharp.Js.Date.toLocaleTimeString", sourceName: "toLocaleTimeString", targetName: "toLocaleTimeString" },
  { id: "Tsonic.CSharp.Js.Date.toLocaleString", sourceName: "toLocaleString", targetName: "toLocaleString" },
] as const;

export const dateTargetMemberMetadata = [
  dateStaticMethodMetadata(dateStaticMethodRows.now, [], dateTargetMemberTypes.longType),
  dateStaticMethodMetadata(dateStaticMethodRows.parse, [targetParameter("dateString", dateTargetMemberTypes.stringType)], dateTargetMemberTypes.doubleType),
  dateStaticMethodMetadata(dateStaticMethodRows.UTC, utcParameters, dateTargetMemberTypes.doubleType),
  dateMethodMetadata({ id: "Tsonic.CSharp.Js.Date.getTime", sourceName: "getTime", targetName: "getTime" }, [], dateTargetMemberTypes.longType),
  dateMethodMetadata({ id: "Tsonic.CSharp.Js.Date.valueOf", sourceName: "valueOf", targetName: "valueOf" }, [], dateTargetMemberTypes.longType),
  dateMethodMetadata({ id: "Tsonic.CSharp.Js.Date.toString", sourceName: "toString", targetName: "ToString" }, [], dateTargetMemberTypes.stringType),
  ...dateGetterRows.map((row) => dateMethodMetadata(row, [], dateTargetMemberTypes.intType)),
  ...dateStringMethodRows.map((row) => dateMethodMetadata(row, [], dateTargetMemberTypes.stringType)),
  dateMethodMetadata({ id: "Tsonic.CSharp.Js.Date.setTime", sourceName: "setTime", targetName: "setTime" }, [targetParameter("milliseconds", dateTargetMemberTypes.doubleType)], dateTargetMemberTypes.doubleType),
  dateMethodMetadata({ id: "Tsonic.CSharp.Js.Date.setMilliseconds", sourceName: "setMilliseconds", targetName: "setMilliseconds" }, [targetParameter("ms", dateTargetMemberTypes.intType)], dateTargetMemberTypes.doubleType),
  dateMethodMetadata({ id: "Tsonic.CSharp.Js.Date.setSeconds", sourceName: "setSeconds", targetName: "setSeconds" }, [
    targetParameter("sec", dateTargetMemberTypes.intType),
    optionalIntParameter("ms"),
  ], dateTargetMemberTypes.doubleType),
  dateMethodMetadata({ id: "Tsonic.CSharp.Js.Date.setMinutes", sourceName: "setMinutes", targetName: "setMinutes" }, [
    targetParameter("min", dateTargetMemberTypes.intType),
    optionalIntParameter("sec"),
    optionalIntParameter("ms"),
  ], dateTargetMemberTypes.doubleType),
  dateMethodMetadata({ id: "Tsonic.CSharp.Js.Date.setHours", sourceName: "setHours", targetName: "setHours" }, [
    targetParameter("hour", dateTargetMemberTypes.intType),
    optionalIntParameter("min"),
    optionalIntParameter("sec"),
    optionalIntParameter("ms"),
  ], dateTargetMemberTypes.doubleType),
  dateMethodMetadata({ id: "Tsonic.CSharp.Js.Date.setDate", sourceName: "setDate", targetName: "setDate" }, [targetParameter("day", dateTargetMemberTypes.intType)], dateTargetMemberTypes.doubleType),
  dateMethodMetadata({ id: "Tsonic.CSharp.Js.Date.setMonth", sourceName: "setMonth", targetName: "setMonth" }, [
    targetParameter("month", dateTargetMemberTypes.intType),
    optionalIntParameter("day"),
  ], dateTargetMemberTypes.doubleType),
  dateMethodMetadata({ id: "Tsonic.CSharp.Js.Date.setFullYear", sourceName: "setFullYear", targetName: "setFullYear" }, [
    targetParameter("year", dateTargetMemberTypes.intType),
    optionalIntParameter("month"),
    optionalIntParameter("day"),
  ], dateTargetMemberTypes.doubleType),
  dateMethodMetadata({ id: "Tsonic.CSharp.Js.Date.setUTCMilliseconds", sourceName: "setUTCMilliseconds", targetName: "setUTCMilliseconds" }, [targetParameter("ms", dateTargetMemberTypes.intType)], dateTargetMemberTypes.doubleType),
  dateMethodMetadata({ id: "Tsonic.CSharp.Js.Date.setUTCSeconds", sourceName: "setUTCSeconds", targetName: "setUTCSeconds" }, [
    targetParameter("sec", dateTargetMemberTypes.intType),
    optionalIntParameter("ms"),
  ], dateTargetMemberTypes.doubleType),
  dateMethodMetadata({ id: "Tsonic.CSharp.Js.Date.setUTCMinutes", sourceName: "setUTCMinutes", targetName: "setUTCMinutes" }, [
    targetParameter("min", dateTargetMemberTypes.intType),
    optionalIntParameter("sec"),
    optionalIntParameter("ms"),
  ], dateTargetMemberTypes.doubleType),
  dateMethodMetadata({ id: "Tsonic.CSharp.Js.Date.setUTCHours", sourceName: "setUTCHours", targetName: "setUTCHours" }, [
    targetParameter("hour", dateTargetMemberTypes.intType),
    optionalIntParameter("min"),
    optionalIntParameter("sec"),
    optionalIntParameter("ms"),
  ], dateTargetMemberTypes.doubleType),
  dateMethodMetadata({ id: "Tsonic.CSharp.Js.Date.setUTCDate", sourceName: "setUTCDate", targetName: "setUTCDate" }, [targetParameter("day", dateTargetMemberTypes.intType)], dateTargetMemberTypes.doubleType),
  dateMethodMetadata({ id: "Tsonic.CSharp.Js.Date.setUTCMonth", sourceName: "setUTCMonth", targetName: "setUTCMonth" }, [
    targetParameter("month", dateTargetMemberTypes.intType),
    optionalIntParameter("day"),
  ], dateTargetMemberTypes.doubleType),
  dateMethodMetadata({ id: "Tsonic.CSharp.Js.Date.setUTCFullYear", sourceName: "setUTCFullYear", targetName: "setUTCFullYear" }, [
    targetParameter("year", dateTargetMemberTypes.intType),
    optionalIntParameter("month"),
    optionalIntParameter("day"),
  ], dateTargetMemberTypes.doubleType),
] satisfies readonly JsSurfaceTargetMemberMetadata[];

import {
  csharpSourcePrimitiveTargetType,
  csharpQualifiedTypeRenderShape,
  csharpTargetNamedType,
  targetParameter,
} from "./source-library.js";
import type {
  JsSurfaceTargetMemberMetadata,
} from "./target-member-metadata.js";
import {
  jsSurfaceTargetMemberMetadataIdentityIndex,
} from "./target-member-metadata.js";

const mathTargetType = csharpTargetNamedType("Tsonic.CSharp.Js.Math", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "Math"));
const doubleType = csharpSourcePrimitiveTargetType("float64");
const intType = csharpSourcePrimitiveTargetType("int32");
const mathCapabilityId = "surface.js.math";
const mathRequiredFacts = [
  "selected source declaration/signature identity",
  "closed numeric argument target facts",
  "Tsonic.CSharp.Js.Math runtime metadata row",
] as const;

interface MathMethodMetadataRow {
  readonly id: string;
  readonly sourceName: string;
  readonly targetName: string;
  readonly parameters: readonly ReturnType<typeof targetParameter>[];
  readonly returnType?: ReturnType<typeof csharpSourcePrimitiveTargetType>;
}

interface MathPropertyMetadataRow {
  readonly id: string;
  readonly sourceName: string;
  readonly targetName: string;
}

function mathMethodMetadata(row: MathMethodMetadataRow): JsSurfaceTargetMemberMetadata {
  return {
    id: row.id,
    sourceName: row.sourceName,
    targetName: row.targetName,
    kind: "method",
    parameters: row.parameters,
    returnType: row.returnType ?? doubleType,
    declaringType: mathTargetType,
    static: true,
    capabilityId: mathCapabilityId,
    requiredFacts: mathRequiredFacts,
    semanticEquivalence: "Selected Tsonic.CSharp.Js.Math runtime member preserves the corresponding ECMAScript Math operation semantics for closed numeric carriers.",
  };
}

function mathPropertyMetadata(row: MathPropertyMetadataRow): JsSurfaceTargetMemberMetadata {
  return {
    id: row.id,
    sourceName: row.sourceName,
    targetName: row.targetName,
    kind: "property",
    returnType: doubleType,
    declaringType: mathTargetType,
    static: true,
    capabilityId: mathCapabilityId,
    requiredFacts: ["selected source property identity", "Tsonic.CSharp.Js.Math runtime metadata row"],
    semanticEquivalence: "Selected Tsonic.CSharp.Js.Math runtime constant preserves the corresponding ECMAScript Math constant value.",
  };
}

const unaryDoubleMethodRows = [
  { id: "Tsonic.CSharp.Js.Math.abs", sourceName: "abs", targetName: "abs" },
  { id: "Tsonic.CSharp.Js.Math.acos", sourceName: "acos", targetName: "acos" },
  { id: "Tsonic.CSharp.Js.Math.acosh", sourceName: "acosh", targetName: "acosh" },
  { id: "Tsonic.CSharp.Js.Math.asin", sourceName: "asin", targetName: "asin" },
  { id: "Tsonic.CSharp.Js.Math.asinh", sourceName: "asinh", targetName: "asinh" },
  { id: "Tsonic.CSharp.Js.Math.atan", sourceName: "atan", targetName: "atan" },
  { id: "Tsonic.CSharp.Js.Math.atanh", sourceName: "atanh", targetName: "atanh" },
  { id: "Tsonic.CSharp.Js.Math.cbrt", sourceName: "cbrt", targetName: "cbrt" },
  { id: "Tsonic.CSharp.Js.Math.cos", sourceName: "cos", targetName: "cos" },
  { id: "Tsonic.CSharp.Js.Math.cosh", sourceName: "cosh", targetName: "cosh" },
  { id: "Tsonic.CSharp.Js.Math.exp", sourceName: "exp", targetName: "exp" },
  { id: "Tsonic.CSharp.Js.Math.expm1", sourceName: "expm1", targetName: "expm1" },
  { id: "Tsonic.CSharp.Js.Math.f16round", sourceName: "f16round", targetName: "f16round" },
  { id: "Tsonic.CSharp.Js.Math.fround", sourceName: "fround", targetName: "fround" },
  { id: "Tsonic.CSharp.Js.Math.log", sourceName: "log", targetName: "log" },
  { id: "Tsonic.CSharp.Js.Math.log10", sourceName: "log10", targetName: "log10" },
  { id: "Tsonic.CSharp.Js.Math.log1p", sourceName: "log1p", targetName: "log1p" },
  { id: "Tsonic.CSharp.Js.Math.log2", sourceName: "log2", targetName: "log2" },
  { id: "Tsonic.CSharp.Js.Math.sin", sourceName: "sin", targetName: "sin" },
  { id: "Tsonic.CSharp.Js.Math.sinh", sourceName: "sinh", targetName: "sinh" },
  { id: "Tsonic.CSharp.Js.Math.sqrt", sourceName: "sqrt", targetName: "sqrt" },
  { id: "Tsonic.CSharp.Js.Math.tan", sourceName: "tan", targetName: "tan" },
  { id: "Tsonic.CSharp.Js.Math.tanh", sourceName: "tanh", targetName: "tanh" },
] as const;

const mathTargetMemberMetadata = [
  ...unaryDoubleMethodRows.map((row) => mathMethodMetadata({ ...row, parameters: [targetParameter("value", doubleType)] })),
  mathMethodMetadata({ id: "Tsonic.CSharp.Js.Math.atan2", sourceName: "atan2", targetName: "atan2", parameters: [targetParameter("y", doubleType), targetParameter("x", doubleType)] }),
  mathMethodMetadata({ id: "Tsonic.CSharp.Js.Math.pow", sourceName: "pow", targetName: "pow", parameters: [targetParameter("value0", doubleType), targetParameter("value1", doubleType)] }),
  mathMethodMetadata({ id: "Tsonic.CSharp.Js.Math.hypot", sourceName: "hypot", targetName: "hypot", parameters: [targetParameter("values", doubleType, { paramsArray: true })] }),
  mathMethodMetadata({ id: "Tsonic.CSharp.Js.Math.max", sourceName: "max", targetName: "max", parameters: [targetParameter("values", doubleType, { paramsArray: true })] }),
  mathMethodMetadata({ id: "Tsonic.CSharp.Js.Math.min", sourceName: "min", targetName: "min", parameters: [targetParameter("values", doubleType, { paramsArray: true })] }),
  mathMethodMetadata({ id: "Tsonic.CSharp.Js.Math.random", sourceName: "random", targetName: "random", parameters: [] }),
  mathMethodMetadata({ id: "Tsonic.CSharp.Js.Math.ceil", sourceName: "ceil", targetName: "ceil", parameters: [targetParameter("value", doubleType)], returnType: doubleType }),
  mathMethodMetadata({ id: "Tsonic.CSharp.Js.Math.floor", sourceName: "floor", targetName: "floor", parameters: [targetParameter("value", doubleType)], returnType: doubleType }),
  mathMethodMetadata({ id: "Tsonic.CSharp.Js.Math.round", sourceName: "round", targetName: "round", parameters: [targetParameter("value", doubleType)], returnType: doubleType }),
  mathMethodMetadata({ id: "Tsonic.CSharp.Js.Math.trunc", sourceName: "trunc", targetName: "trunc", parameters: [targetParameter("value", doubleType)], returnType: doubleType }),
  mathMethodMetadata({ id: "Tsonic.CSharp.Js.Math.sign", sourceName: "sign", targetName: "sign", parameters: [targetParameter("value", doubleType)], returnType: doubleType }),
  mathMethodMetadata({ id: "Tsonic.CSharp.Js.Math.imul", sourceName: "imul", targetName: "imul", parameters: [targetParameter("left", intType), targetParameter("right", intType)], returnType: intType }),
  mathMethodMetadata({ id: "Tsonic.CSharp.Js.Math.clz32", sourceName: "clz32", targetName: "clz32", parameters: [targetParameter("value", intType)], returnType: intType }),
] satisfies readonly JsSurfaceTargetMemberMetadata[];
export const mathTargetMemberIdentityIndex = jsSurfaceTargetMemberMetadataIdentityIndex("Math", mathTargetMemberMetadata);

const mathPropertyTargetMemberMetadata = [
  { id: "Tsonic.CSharp.Js.Math.E", sourceName: "E", targetName: "E" },
  { id: "Tsonic.CSharp.Js.Math.PI", sourceName: "PI", targetName: "PI" },
  { id: "Tsonic.CSharp.Js.Math.LN2", sourceName: "LN2", targetName: "LN2" },
  { id: "Tsonic.CSharp.Js.Math.LN10", sourceName: "LN10", targetName: "LN10" },
  { id: "Tsonic.CSharp.Js.Math.LOG2E", sourceName: "LOG2E", targetName: "LOG2E" },
  { id: "Tsonic.CSharp.Js.Math.LOG10E", sourceName: "LOG10E", targetName: "LOG10E" },
  { id: "Tsonic.CSharp.Js.Math.SQRT1_2", sourceName: "SQRT1_2", targetName: "SQRT1_2" },
  { id: "Tsonic.CSharp.Js.Math.SQRT2", sourceName: "SQRT2", targetName: "SQRT2" },
].map(mathPropertyMetadata) satisfies readonly JsSurfaceTargetMemberMetadata[];
export const mathPropertyTargetMemberIdentityIndex = jsSurfaceTargetMemberMetadataIdentityIndex("Math", mathPropertyTargetMemberMetadata);

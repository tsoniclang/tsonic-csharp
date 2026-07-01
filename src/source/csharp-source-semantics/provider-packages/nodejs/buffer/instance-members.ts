import type {
  CsharpTargetMember,
} from "../../../target-types.js";
import {
  targetParameter,
} from "../../../surfaces/js/source-library.js";
import {
  nodeBufferCompareInstanceExportName,
  nodeBufferCompareInstanceTargetMemberId,
  nodeBufferCopyExportName,
  nodeBufferCopyTargetMemberId,
  nodeBufferEqualsExportName,
  nodeBufferEqualsTargetMemberId,
  nodeBufferIncludesExportName,
  nodeBufferIncludesTargetMemberId,
  nodeBufferIndexOfExportName,
  nodeBufferIndexOfTargetMemberId,
  nodeBufferLastIndexOfExportName,
  nodeBufferLastIndexOfTargetMemberId,
  nodeBufferLengthTargetMemberId,
  nodeBufferReadUInt8ExportName,
  nodeBufferReadUInt8TargetMemberId,
  nodeBufferSliceExportName,
  nodeBufferSliceTargetMemberId,
  nodeBufferSubarrayExportName,
  nodeBufferSubarrayTargetMemberId,
  nodeBufferTargetType,
  nodeBufferToStringExportName,
  nodeBufferToStringTargetMemberId,
  nodeBufferWriteUInt8ExportName,
  nodeBufferWriteUInt8TargetMemberId,
  nodeBufferWriteExportName,
  nodeBufferWriteTargetMemberId,
} from "./identities.js";
import {
  nodeBufferByteTargetType,
  nodeBufferBoolTargetType,
  nodeBufferIntTargetType,
  nodeBufferNullableIntTargetType,
  nodeBufferObjectTargetType,
  nodeBufferStringTargetType,
  nodeBufferToStringEndTargetType,
} from "./helpers.js";

export function getNodeBufferLengthTargetMember(): CsharpTargetMember {
  return {
    id: nodeBufferLengthTargetMemberId,
    sourceName: "length",
    targetName: "length",
    kind: "property",
    parameters: [],
    returnType: nodeBufferIntTargetType,
    declaringType: nodeBufferTargetType,
  };
}

export function getNodeBufferEqualsTargetMember(): CsharpTargetMember {
  return {
    id: nodeBufferEqualsTargetMemberId,
    sourceName: nodeBufferEqualsExportName,
    targetName: "equals",
    kind: "method",
    parameters: [targetParameter("otherBuffer", nodeBufferTargetType)],
    returnType: nodeBufferBoolTargetType,
    declaringType: nodeBufferTargetType,
  };
}

export function getNodeBufferCompareInstanceTargetMember(): CsharpTargetMember {
  return {
    id: nodeBufferCompareInstanceTargetMemberId,
    sourceName: nodeBufferCompareInstanceExportName,
    targetName: "compare",
    kind: "method",
    parameters: [targetParameter("target", nodeBufferTargetType)],
    returnType: nodeBufferIntTargetType,
    declaringType: nodeBufferTargetType,
  };
}

export function getNodeBufferCopyTargetMember(): CsharpTargetMember {
  return {
    id: nodeBufferCopyTargetMemberId,
    sourceName: nodeBufferCopyExportName,
    targetName: "copy",
    kind: "method",
    parameters: [
      targetParameter("target", nodeBufferTargetType),
      targetParameter("targetStart", nodeBufferIntTargetType, { optional: true }),
      targetParameter("sourceStart", nodeBufferNullableIntTargetType(), { optional: true }),
      targetParameter("sourceEnd", nodeBufferNullableIntTargetType(), { optional: true }),
    ],
    returnType: nodeBufferIntTargetType,
    declaringType: nodeBufferTargetType,
  };
}

export function getNodeBufferIncludesTargetMember(): CsharpTargetMember {
  return nodeBufferSearchTargetMember({
    targetMemberId: nodeBufferIncludesTargetMemberId,
    sourceName: nodeBufferIncludesExportName,
    targetName: "includes",
    returnType: nodeBufferBoolTargetType,
  });
}

export function getNodeBufferIndexOfTargetMember(): CsharpTargetMember {
  return nodeBufferSearchTargetMember({
    targetMemberId: nodeBufferIndexOfTargetMemberId,
    sourceName: nodeBufferIndexOfExportName,
    targetName: "indexOf",
    returnType: nodeBufferIntTargetType,
  });
}

export function getNodeBufferLastIndexOfTargetMember(): CsharpTargetMember {
  return {
    id: nodeBufferLastIndexOfTargetMemberId,
    sourceName: nodeBufferLastIndexOfExportName,
    targetName: "lastIndexOf",
    kind: "method",
    parameters: [
      targetParameter("value", nodeBufferObjectTargetType, { csharpAcceptsClosedSourceArgument: true }),
      targetParameter("byteOffset", nodeBufferNullableIntTargetType(), { optional: true }),
      targetParameter("encoding", nodeBufferStringTargetType, { optional: true }),
    ],
    returnType: nodeBufferIntTargetType,
    declaringType: nodeBufferTargetType,
  };
}

export function getNodeBufferSliceTargetMember(): CsharpTargetMember {
  return nodeBufferRangeTargetMember({
    targetMemberId: nodeBufferSliceTargetMemberId,
    sourceName: nodeBufferSliceExportName,
    targetName: "slice",
  });
}

export function getNodeBufferSubarrayTargetMember(): CsharpTargetMember {
  return nodeBufferRangeTargetMember({
    targetMemberId: nodeBufferSubarrayTargetMemberId,
    sourceName: nodeBufferSubarrayExportName,
    targetName: "subarray",
  });
}

export function getNodeBufferToStringTargetMember(): CsharpTargetMember {
  return {
    id: nodeBufferToStringTargetMemberId,
    sourceName: nodeBufferToStringExportName,
    targetName: "toString",
    kind: "method",
    parameters: [
      targetParameter("encoding", nodeBufferStringTargetType, { optional: true }),
      targetParameter("start", nodeBufferIntTargetType, { optional: true }),
      targetParameter("end", nodeBufferToStringEndTargetType(), { optional: true }),
    ],
    returnType: nodeBufferStringTargetType,
    declaringType: nodeBufferTargetType,
  };
}

export function getNodeBufferReadUInt8TargetMember(): CsharpTargetMember {
  return {
    id: nodeBufferReadUInt8TargetMemberId,
    sourceName: nodeBufferReadUInt8ExportName,
    targetName: "readUInt8",
    kind: "method",
    parameters: [targetParameter("offset", nodeBufferIntTargetType, { optional: true })],
    returnType: nodeBufferByteTargetType,
    declaringType: nodeBufferTargetType,
  };
}

export function getNodeBufferWriteTargetMember(): CsharpTargetMember {
  return {
    id: nodeBufferWriteTargetMemberId,
    sourceName: nodeBufferWriteExportName,
    targetName: "write",
    kind: "method",
    parameters: [
      targetParameter("str", nodeBufferStringTargetType),
      targetParameter("offset", nodeBufferIntTargetType, { optional: true }),
      targetParameter("length", nodeBufferNullableIntTargetType(), { optional: true }),
      targetParameter("encoding", nodeBufferStringTargetType, { optional: true }),
    ],
    returnType: nodeBufferIntTargetType,
    declaringType: nodeBufferTargetType,
  };
}

export function getNodeBufferWriteUInt8TargetMember(): CsharpTargetMember {
  return {
    id: nodeBufferWriteUInt8TargetMemberId,
    sourceName: nodeBufferWriteUInt8ExportName,
    targetName: "writeUInt8",
    kind: "method",
    parameters: [
      targetParameter("value", nodeBufferByteTargetType),
      targetParameter("offset", nodeBufferIntTargetType, { optional: true }),
    ],
    returnType: nodeBufferIntTargetType,
    declaringType: nodeBufferTargetType,
  };
}

function nodeBufferSearchTargetMember(row: {
  readonly targetMemberId: string;
  readonly sourceName: string;
  readonly targetName: string;
  readonly returnType: CsharpTargetMember["returnType"];
}): CsharpTargetMember {
  return {
    id: row.targetMemberId,
    sourceName: row.sourceName,
    targetName: row.targetName,
    kind: "method",
    parameters: [
      targetParameter("value", nodeBufferObjectTargetType, { csharpAcceptsClosedSourceArgument: true }),
      targetParameter("byteOffset", nodeBufferIntTargetType, { optional: true }),
      targetParameter("encoding", nodeBufferStringTargetType, { optional: true }),
    ],
    returnType: row.returnType,
    declaringType: nodeBufferTargetType,
  };
}

function nodeBufferRangeTargetMember(row: {
  readonly targetMemberId: string;
  readonly sourceName: string;
  readonly targetName: string;
}): CsharpTargetMember {
  return {
    id: row.targetMemberId,
    sourceName: row.sourceName,
    targetName: row.targetName,
    kind: "method",
    parameters: [
      targetParameter("start", nodeBufferNullableIntTargetType(), { optional: true }),
      targetParameter("end", nodeBufferNullableIntTargetType(), { optional: true }),
    ],
    returnType: nodeBufferTargetType,
    declaringType: nodeBufferTargetType,
  };
}

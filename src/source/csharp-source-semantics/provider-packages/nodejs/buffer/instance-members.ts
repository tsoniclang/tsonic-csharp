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
  nodeBufferLengthTargetMemberId,
  nodeBufferSliceExportName,
  nodeBufferSliceTargetMemberId,
  nodeBufferSubarrayExportName,
  nodeBufferSubarrayTargetMemberId,
  nodeBufferTargetType,
  nodeBufferToStringExportName,
  nodeBufferToStringTargetMemberId,
  nodeBufferWriteExportName,
  nodeBufferWriteTargetMemberId,
} from "./identities.js";
import {
  nodeBufferBoolTargetType,
  nodeBufferIntTargetType,
  nodeBufferNullableIntTargetType,
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

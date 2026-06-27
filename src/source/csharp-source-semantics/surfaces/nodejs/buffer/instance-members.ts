import type {
  TargetMember,
} from "@tsonic/tsts";
import {
  targetParameter,
} from "../../js/source-library.js";
import {
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
} from "./identities.js";
import {
  nodeBufferBoolTargetType,
  nodeBufferIntTargetType,
  nodeBufferNullableIntTargetType,
  nodeBufferStringTargetType,
  nodeBufferToStringEndTargetType,
} from "./helpers.js";

export function getNodeBufferLengthTargetMember(): TargetMember {
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

export function getNodeBufferEqualsTargetMember(): TargetMember {
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

export function getNodeBufferSliceTargetMember(): TargetMember {
  return nodeBufferRangeTargetMember({
    targetMemberId: nodeBufferSliceTargetMemberId,
    sourceName: nodeBufferSliceExportName,
    targetName: "slice",
  });
}

export function getNodeBufferSubarrayTargetMember(): TargetMember {
  return nodeBufferRangeTargetMember({
    targetMemberId: nodeBufferSubarrayTargetMemberId,
    sourceName: nodeBufferSubarrayExportName,
    targetName: "subarray",
  });
}

export function getNodeBufferToStringTargetMember(): TargetMember {
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

function nodeBufferRangeTargetMember(row: {
  readonly targetMemberId: string;
  readonly sourceName: string;
  readonly targetName: string;
}): TargetMember {
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

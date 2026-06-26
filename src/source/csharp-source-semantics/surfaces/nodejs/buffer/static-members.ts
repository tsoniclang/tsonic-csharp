import type {
  TargetMember,
} from "@tsonic/tsts";
import {
  targetParameter,
} from "../../js/source-library.js";
import {
  nodeBufferAllocExportName,
  nodeBufferAllocTargetMemberId,
  nodeBufferAllocUnsafeExportName,
  nodeBufferAllocUnsafeSlowExportName,
  nodeBufferAllocUnsafeSlowTargetMemberId,
  nodeBufferAllocUnsafeTargetMemberId,
  nodeBufferAtobExportName,
  nodeBufferAtobTargetMemberId,
  nodeBufferBtoaExportName,
  nodeBufferBtoaTargetMemberId,
  nodeBufferByteLengthExportName,
  nodeBufferByteLengthTargetMemberId,
  nodeBufferCompareExportName,
  nodeBufferCompareTargetMemberId,
  nodeBufferConcatExportName,
  nodeBufferConcatTargetMemberId,
  nodeBufferFromExportName,
  nodeBufferFromStringTargetMemberId,
  nodeBufferIsAsciiExportName,
  nodeBufferIsAsciiTargetMemberId,
  nodeBufferIsEncodingExportName,
  nodeBufferIsEncodingTargetMemberId,
  nodeBufferIsUtf8ExportName,
  nodeBufferIsUtf8TargetMemberId,
  nodeBufferModuleTargetType,
  nodeBufferOfExportName,
  nodeBufferOfTargetMemberId,
  nodeBufferTargetType,
} from "./identities.js";
import {
  nodeBufferBoolTargetType,
  nodeBufferIntTargetType,
  nodeBufferNullableIntTargetType,
  nodeBufferStringTargetType,
} from "./helpers.js";

export function getNodeBufferFromStringTargetMember(): TargetMember {
  return {
    id: nodeBufferFromStringTargetMemberId,
    sourceName: nodeBufferFromExportName,
    targetName: nodeBufferFromExportName,
    kind: "method",
    parameters: [
      targetParameter("value", nodeBufferStringTargetType),
      targetParameter("encoding", nodeBufferStringTargetType, { optional: true }),
    ],
    returnType: nodeBufferTargetType,
    declaringType: nodeBufferTargetType,
    static: true,
  };
}

export function getNodeBufferAllocTargetMember(): TargetMember {
  return {
    id: nodeBufferAllocTargetMemberId,
    sourceName: nodeBufferAllocExportName,
    targetName: nodeBufferAllocExportName,
    kind: "method",
    parameters: [targetParameter("size", nodeBufferIntTargetType)],
    returnType: nodeBufferTargetType,
    declaringType: nodeBufferTargetType,
    static: true,
  };
}

export function getNodeBufferAllocUnsafeTargetMember(): TargetMember {
  return {
    id: nodeBufferAllocUnsafeTargetMemberId,
    sourceName: nodeBufferAllocUnsafeExportName,
    targetName: nodeBufferAllocUnsafeExportName,
    kind: "method",
    parameters: [targetParameter("size", nodeBufferIntTargetType)],
    returnType: nodeBufferTargetType,
    declaringType: nodeBufferTargetType,
    static: true,
  };
}

export function getNodeBufferAllocUnsafeSlowTargetMember(): TargetMember {
  return {
    id: nodeBufferAllocUnsafeSlowTargetMemberId,
    sourceName: nodeBufferAllocUnsafeSlowExportName,
    targetName: nodeBufferAllocUnsafeSlowExportName,
    kind: "method",
    parameters: [targetParameter("size", nodeBufferIntTargetType)],
    returnType: nodeBufferTargetType,
    declaringType: nodeBufferTargetType,
    static: true,
  };
}

export function getNodeBufferByteLengthTargetMember(): TargetMember {
  return {
    id: nodeBufferByteLengthTargetMemberId,
    sourceName: nodeBufferByteLengthExportName,
    targetName: nodeBufferByteLengthExportName,
    kind: "method",
    parameters: [
      targetParameter("value", nodeBufferStringTargetType),
      targetParameter("encoding", nodeBufferStringTargetType, { optional: true }),
    ],
    returnType: nodeBufferIntTargetType,
    declaringType: nodeBufferTargetType,
    static: true,
  };
}

export function getNodeBufferCompareTargetMember(): TargetMember {
  return {
    id: nodeBufferCompareTargetMemberId,
    sourceName: nodeBufferCompareExportName,
    targetName: nodeBufferCompareExportName,
    kind: "method",
    parameters: [
      targetParameter("buf1", nodeBufferTargetType),
      targetParameter("buf2", nodeBufferTargetType),
    ],
    returnType: nodeBufferIntTargetType,
    declaringType: nodeBufferTargetType,
    static: true,
  };
}

export function getNodeBufferConcatTargetMember(): TargetMember {
  return {
    id: nodeBufferConcatTargetMemberId,
    sourceName: nodeBufferConcatExportName,
    targetName: nodeBufferConcatExportName,
    kind: "method",
    parameters: [
      targetParameter("list", { kind: "array", element: nodeBufferTargetType }),
      targetParameter("totalLength", nodeBufferNullableIntTargetType(), { optional: true }),
    ],
    returnType: nodeBufferTargetType,
    declaringType: nodeBufferTargetType,
    static: true,
  };
}

export function getNodeBufferIsEncodingTargetMember(): TargetMember {
  return {
    id: nodeBufferIsEncodingTargetMemberId,
    sourceName: nodeBufferIsEncodingExportName,
    targetName: nodeBufferIsEncodingExportName,
    kind: "method",
    parameters: [targetParameter("encoding", nodeBufferStringTargetType)],
    returnType: nodeBufferBoolTargetType,
    declaringType: nodeBufferTargetType,
    static: true,
  };
}

export function getNodeBufferOfTargetMember(): TargetMember {
  return {
    id: nodeBufferOfTargetMemberId,
    sourceName: nodeBufferOfExportName,
    targetName: nodeBufferOfExportName,
    kind: "method",
    parameters: [targetParameter("items", nodeBufferIntTargetType, { paramsArray: true })],
    returnType: nodeBufferTargetType,
    declaringType: nodeBufferTargetType,
    static: true,
  };
}

export function getNodeBufferAtobTargetMember(): TargetMember {
  return {
    id: nodeBufferAtobTargetMemberId,
    sourceName: nodeBufferAtobExportName,
    targetName: nodeBufferAtobExportName,
    kind: "method",
    parameters: [targetParameter("data", nodeBufferStringTargetType)],
    returnType: nodeBufferStringTargetType,
    declaringType: nodeBufferModuleTargetType,
    static: true,
  };
}

export function getNodeBufferBtoaTargetMember(): TargetMember {
  return {
    id: nodeBufferBtoaTargetMemberId,
    sourceName: nodeBufferBtoaExportName,
    targetName: nodeBufferBtoaExportName,
    kind: "method",
    parameters: [targetParameter("data", nodeBufferStringTargetType)],
    returnType: nodeBufferStringTargetType,
    declaringType: nodeBufferModuleTargetType,
    static: true,
  };
}

export function getNodeBufferIsAsciiTargetMember(): TargetMember {
  return {
    id: nodeBufferIsAsciiTargetMemberId,
    sourceName: nodeBufferIsAsciiExportName,
    targetName: nodeBufferIsAsciiExportName,
    kind: "method",
    parameters: [targetParameter("value", nodeBufferTargetType)],
    returnType: nodeBufferBoolTargetType,
    declaringType: nodeBufferModuleTargetType,
    static: true,
  };
}

export function getNodeBufferIsUtf8TargetMember(): TargetMember {
  return {
    id: nodeBufferIsUtf8TargetMemberId,
    sourceName: nodeBufferIsUtf8ExportName,
    targetName: nodeBufferIsUtf8ExportName,
    kind: "method",
    parameters: [targetParameter("value", nodeBufferTargetType)],
    returnType: nodeBufferBoolTargetType,
    declaringType: nodeBufferModuleTargetType,
    static: true,
  };
}

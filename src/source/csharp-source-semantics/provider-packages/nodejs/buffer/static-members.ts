import type {
  CsharpTargetMember,
} from "../../../target-types.js";
import {
  targetParameter,
} from "../../../surfaces/js/source-library.js";
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
  nodeBufferFromBufferTargetMemberId,
  nodeBufferFromNumberArrayTargetMemberId,
  nodeBufferFromStringTargetMemberId,
  nodeBufferIsAsciiExportName,
  nodeBufferIsAsciiTargetMemberId,
  nodeBufferIsBufferExportName,
  nodeBufferIsBufferTargetMemberId,
  nodeBufferIsEncodingExportName,
  nodeBufferIsEncodingTargetMemberId,
  nodeBufferIsUtf8ExportName,
  nodeBufferIsUtf8TargetMemberId,
  nodeBufferModuleTargetType,
  nodeBufferOfExportName,
  nodeBufferOfTargetMemberId,
  nodeBufferPoolSizeExportName,
  nodeBufferPoolSizeTargetMemberId,
  nodeBufferTargetType,
  nodeBufferTranscodeExportName,
  nodeBufferTranscodeTargetMemberId,
} from "./identities.js";
import {
  nodeBufferBoolTargetType,
  nodeBufferIntTargetType,
  nodeBufferNullableIntTargetType,
  nodeBufferObjectTargetType,
  nodeBufferStringTargetType,
} from "./helpers.js";

export function getNodeBufferFromStringTargetMember(): CsharpTargetMember {
  return {
    id: nodeBufferFromStringTargetMemberId,
    sourceName: nodeBufferFromExportName,
    targetName: "from",
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

export function getNodeBufferFromNumberArrayTargetMember(): CsharpTargetMember {
  return {
    id: nodeBufferFromNumberArrayTargetMemberId,
    sourceName: nodeBufferFromExportName,
    targetName: "from",
    kind: "method",
    parameters: [targetParameter("array", { kind: "array", element: nodeBufferIntTargetType })],
    returnType: nodeBufferTargetType,
    declaringType: nodeBufferTargetType,
    static: true,
  };
}

export function getNodeBufferFromBufferTargetMember(): CsharpTargetMember {
  return {
    id: nodeBufferFromBufferTargetMemberId,
    sourceName: nodeBufferFromExportName,
    targetName: "from",
    kind: "method",
    parameters: [targetParameter("buffer", nodeBufferTargetType)],
    returnType: nodeBufferTargetType,
    declaringType: nodeBufferTargetType,
    static: true,
  };
}

export function getNodeBufferAllocTargetMember(): CsharpTargetMember {
  return {
    id: nodeBufferAllocTargetMemberId,
    sourceName: nodeBufferAllocExportName,
    targetName: "alloc",
    kind: "method",
    parameters: [targetParameter("size", nodeBufferIntTargetType)],
    returnType: nodeBufferTargetType,
    declaringType: nodeBufferTargetType,
    static: true,
  };
}

export function getNodeBufferAllocUnsafeTargetMember(): CsharpTargetMember {
  return {
    id: nodeBufferAllocUnsafeTargetMemberId,
    sourceName: nodeBufferAllocUnsafeExportName,
    targetName: "allocUnsafe",
    kind: "method",
    parameters: [targetParameter("size", nodeBufferIntTargetType)],
    returnType: nodeBufferTargetType,
    declaringType: nodeBufferTargetType,
    static: true,
  };
}

export function getNodeBufferAllocUnsafeSlowTargetMember(): CsharpTargetMember {
  return {
    id: nodeBufferAllocUnsafeSlowTargetMemberId,
    sourceName: nodeBufferAllocUnsafeSlowExportName,
    targetName: "allocUnsafeSlow",
    kind: "method",
    parameters: [targetParameter("size", nodeBufferIntTargetType)],
    returnType: nodeBufferTargetType,
    declaringType: nodeBufferTargetType,
    static: true,
  };
}

export function getNodeBufferByteLengthTargetMember(): CsharpTargetMember {
  return {
    id: nodeBufferByteLengthTargetMemberId,
    sourceName: nodeBufferByteLengthExportName,
    targetName: "byteLength",
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

export function getNodeBufferCompareTargetMember(): CsharpTargetMember {
  return {
    id: nodeBufferCompareTargetMemberId,
    sourceName: nodeBufferCompareExportName,
    targetName: "compare",
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

export function getNodeBufferConcatTargetMember(): CsharpTargetMember {
  return {
    id: nodeBufferConcatTargetMemberId,
    sourceName: nodeBufferConcatExportName,
    targetName: "concat",
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

export function getNodeBufferIsBufferTargetMember(): CsharpTargetMember {
  return {
    id: nodeBufferIsBufferTargetMemberId,
    sourceName: nodeBufferIsBufferExportName,
    targetName: "isBuffer",
    kind: "method",
    parameters: [targetParameter("value", nodeBufferObjectTargetType)],
    returnType: nodeBufferBoolTargetType,
    declaringType: nodeBufferTargetType,
    static: true,
  };
}

export function getNodeBufferPoolSizeTargetMember(): CsharpTargetMember {
  return {
    id: nodeBufferPoolSizeTargetMemberId,
    sourceName: nodeBufferPoolSizeExportName,
    targetName: "poolSize",
    kind: "property",
    parameters: [],
    returnType: nodeBufferIntTargetType,
    declaringType: nodeBufferTargetType,
    static: true,
  };
}

export function getNodeBufferIsEncodingTargetMember(): CsharpTargetMember {
  return {
    id: nodeBufferIsEncodingTargetMemberId,
    sourceName: nodeBufferIsEncodingExportName,
    targetName: "isEncoding",
    kind: "method",
    parameters: [targetParameter("encoding", nodeBufferStringTargetType)],
    returnType: nodeBufferBoolTargetType,
    declaringType: nodeBufferTargetType,
    static: true,
  };
}

export function getNodeBufferOfTargetMember(): CsharpTargetMember {
  return {
    id: nodeBufferOfTargetMemberId,
    sourceName: nodeBufferOfExportName,
    targetName: "of",
    kind: "method",
    parameters: [targetParameter("items", nodeBufferIntTargetType, { paramsArray: true })],
    returnType: nodeBufferTargetType,
    declaringType: nodeBufferTargetType,
    static: true,
  };
}

export function getNodeBufferTranscodeTargetMember(): CsharpTargetMember {
  return {
    id: nodeBufferTranscodeTargetMemberId,
    sourceName: nodeBufferTranscodeExportName,
    targetName: "transcode",
    kind: "method",
    parameters: [
      targetParameter("source", nodeBufferTargetType),
      targetParameter("fromEncoding", nodeBufferStringTargetType),
      targetParameter("toEncoding", nodeBufferStringTargetType),
    ],
    returnType: nodeBufferTargetType,
    declaringType: nodeBufferModuleTargetType,
    static: true,
  };
}

export function getNodeBufferAtobTargetMember(): CsharpTargetMember {
  return {
    id: nodeBufferAtobTargetMemberId,
    sourceName: nodeBufferAtobExportName,
    targetName: "atob",
    kind: "method",
    parameters: [targetParameter("data", nodeBufferStringTargetType)],
    returnType: nodeBufferStringTargetType,
    declaringType: nodeBufferModuleTargetType,
    static: true,
  };
}

export function getNodeBufferBtoaTargetMember(): CsharpTargetMember {
  return {
    id: nodeBufferBtoaTargetMemberId,
    sourceName: nodeBufferBtoaExportName,
    targetName: "btoa",
    kind: "method",
    parameters: [targetParameter("data", nodeBufferStringTargetType)],
    returnType: nodeBufferStringTargetType,
    declaringType: nodeBufferModuleTargetType,
    static: true,
  };
}

export function getNodeBufferIsAsciiTargetMember(): CsharpTargetMember {
  return {
    id: nodeBufferIsAsciiTargetMemberId,
    sourceName: nodeBufferIsAsciiExportName,
    targetName: "isAscii",
    kind: "method",
    parameters: [targetParameter("value", nodeBufferTargetType)],
    returnType: nodeBufferBoolTargetType,
    declaringType: nodeBufferModuleTargetType,
    static: true,
  };
}

export function getNodeBufferIsUtf8TargetMember(): CsharpTargetMember {
  return {
    id: nodeBufferIsUtf8TargetMemberId,
    sourceName: nodeBufferIsUtf8ExportName,
    targetName: "isUtf8",
    kind: "method",
    parameters: [targetParameter("value", nodeBufferTargetType)],
    returnType: nodeBufferBoolTargetType,
    declaringType: nodeBufferModuleTargetType,
    static: true,
  };
}

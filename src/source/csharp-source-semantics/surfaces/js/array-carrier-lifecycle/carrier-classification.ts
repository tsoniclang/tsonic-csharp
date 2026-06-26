import type {
  CsharpArrayBoundaryFact,
  CsharpArrayCarrierLane,
} from "../../../../csharp-facts.js";
import {
  csharpEnumerableTargetType,
  csharpListTargetType,
  csharpReadOnlyListTargetType,
} from "../../../target-types.js";
import {
  csharpJsArrayCarrierTargetType,
} from "../array-target-type.js";
import type {
  ArrayParameterAnalysis,
  ArrayUse,
} from "./types.js";

export function boundaryFactForArrayParameter(parameter: ArrayParameterAnalysis): CsharpArrayBoundaryFact {
  const lane = laneForArrayUses(parameter.uses);
  if (lane === "native-dense-mutable") {
    const list = csharpListTargetType(parameter.elementType);
    return {
      publicShape: "List<T>",
      publicType: list,
      coreCarrierLane: lane,
      coreCarrierType: list,
      preservesMutationVisibility: true,
      requiresCopyIn: false,
      requiresCopyOut: false,
    };
  }
  if (lane === "native-read-indexable") {
    const readOnlyList = csharpReadOnlyListTargetType(parameter.elementType);
    return {
      publicShape: "IReadOnlyList<T>",
      publicType: readOnlyList,
      coreCarrierLane: lane,
      coreCarrierType: readOnlyList,
      preservesMutationVisibility: false,
      requiresCopyIn: false,
      requiresCopyOut: false,
    };
  }
  if (lane === "native-read-sequence") {
    const enumerable = csharpEnumerableTargetType(parameter.elementType);
    return {
      publicShape: "IEnumerable<T>",
      publicType: enumerable,
      coreCarrierLane: lane,
      coreCarrierType: enumerable,
      preservesMutationVisibility: false,
      requiresCopyIn: false,
      requiresCopyOut: false,
    };
  }
  if (lane === "js-full-internal") {
    const carrier = csharpJsArrayCarrierTargetType(parameter.elementType);
    return {
      publicShape: "compat-facade",
      publicType: csharpEnumerableTargetType(parameter.elementType),
      coreCarrierLane: lane,
      coreCarrierType: carrier,
      preservesMutationVisibility: false,
      requiresCopyIn: true,
      requiresCopyOut: false,
    };
  }
  return {
    publicShape: "T[]",
    publicType: { kind: "array", element: parameter.elementType },
    coreCarrierLane: "native-array-required",
    coreCarrierType: { kind: "array", element: parameter.elementType },
    preservesMutationVisibility: false,
    requiresCopyIn: false,
    requiresCopyOut: false,
  };
}

function laneForArrayUses(uses: ReadonlySet<ArrayUse>): CsharpArrayCarrierLane {
  if (uses.has("full-js")) {
    return "js-full-internal";
  }
  if (uses.has("dense-mutation")) {
    return "native-dense-mutable";
  }
  if (uses.has("index-read") || uses.has("length-read")) {
    return "native-read-indexable";
  }
  if (uses.has("sequential-read")) {
    return "native-read-sequence";
  }
  return "native-array-required";
}

import type {
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  targetTypeRefEquals,
  targetTypeRefIsClosed,
} from "../target-ref-utils.js";

export function closeSelectedTargetResultType(
  openTargetType: TargetTypeRef,
  selectedSourceResultType: TargetTypeRef | undefined,
): TargetTypeRef | undefined {
  if (targetTypeRefIsClosed(openTargetType)) {
    return openTargetType;
  }
  return selectedSourceResultType === undefined
    ? undefined
    : closeTargetTypeRef(
        openTargetType,
        selectedSourceResultType,
        new Map<string, TargetTypeRef>(),
      );
}

function closeTargetTypeRef(
  openTargetType: TargetTypeRef,
  selectedSourceResultType: TargetTypeRef,
  substitutions: Map<string, TargetTypeRef>,
): TargetTypeRef | undefined {
  if (targetTypeRefIsClosed(openTargetType)) {
    return openTargetType;
  }
  switch (openTargetType.kind) {
    case "type-parameter": {
      const existing = substitutions.get(openTargetType.name);
      if (existing !== undefined) {
        return targetTypeRefEquals(existing, selectedSourceResultType) ? existing : undefined;
      }
      substitutions.set(openTargetType.name, selectedSourceResultType);
      return selectedSourceResultType;
    }
    case "target-named": {
      if (selectedSourceResultType.kind !== "target-named" ||
          selectedSourceResultType.id !== openTargetType.id) {
        return undefined;
      }
      const typeArguments = closeTargetTypeRefs(
        openTargetType.typeArguments ?? [],
        selectedSourceResultType.typeArguments ?? [],
        substitutions,
      );
      return typeArguments === undefined
        ? undefined
        : { ...openTargetType, typeArguments };
    }
    case "array": {
      if (selectedSourceResultType.kind !== "array" ||
          (selectedSourceResultType.rank ?? 1) !== (openTargetType.rank ?? 1)) {
        return undefined;
      }
      const element = closeTargetTypeRef(openTargetType.element, selectedSourceResultType.element, substitutions);
      return element === undefined ? undefined : { ...openTargetType, element };
    }
    case "tuple": {
      if (selectedSourceResultType.kind !== "tuple") {
        return undefined;
      }
      const elements = closeTargetTypeRefs(openTargetType.elements, selectedSourceResultType.elements, substitutions);
      return elements === undefined ? undefined : { ...openTargetType, elements };
    }
    case "pointer": {
      if (selectedSourceResultType.kind !== "pointer" ||
          selectedSourceResultType.mutability !== openTargetType.mutability) {
        return undefined;
      }
      const pointee = closeTargetTypeRef(openTargetType.pointee, selectedSourceResultType.pointee, substitutions);
      return pointee === undefined ? undefined : { ...openTargetType, pointee };
    }
    case "function-pointer": {
      if (selectedSourceResultType.kind !== "function-pointer" ||
          !stringListsEqual(selectedSourceResultType.abi ?? [], openTargetType.abi ?? [])) {
        return undefined;
      }
      const args = closeTargetTypeRefs(openTargetType.args, selectedSourceResultType.args, substitutions);
      const result = closeTargetTypeRef(openTargetType.result, selectedSourceResultType.result, substitutions);
      return args === undefined || result === undefined
        ? undefined
        : { ...openTargetType, args, result };
    }
    case "associated-type": {
      if (selectedSourceResultType.kind !== "associated-type" ||
          selectedSourceResultType.name !== openTargetType.name) {
        return undefined;
      }
      const owner = closeTargetTypeRef(openTargetType.owner, selectedSourceResultType.owner, substitutions);
      return owner === undefined ? undefined : { ...openTargetType, owner };
    }
    case "source-primitive":
    case "opaque":
    case "lifetime":
    case "target-specific":
      return undefined;
  }
}

function closeTargetTypeRefs(
  openTargetTypes: readonly TargetTypeRef[],
  selectedSourceResultTypes: readonly TargetTypeRef[],
  substitutions: Map<string, TargetTypeRef>,
): readonly TargetTypeRef[] | undefined {
  if (openTargetTypes.length !== selectedSourceResultTypes.length) {
    return undefined;
  }
  const closed = openTargetTypes.map((type, index) => {
    const selected = selectedSourceResultTypes[index];
    return selected === undefined ? undefined : closeTargetTypeRef(type, selected, substitutions);
  });
  return closed.some((type) => type === undefined)
    ? undefined
    : closed as readonly TargetTypeRef[];
}

function stringListsEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

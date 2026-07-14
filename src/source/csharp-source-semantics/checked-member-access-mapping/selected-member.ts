import {
  providerVirtualDeclarationFactKey,
} from "@tsonic/tsts";
import type {
  CheckedElementAccessMappingRequest,
  CheckedPropertyAccessMappingRequest,
  ExtensionFactSubject,
  ExtensionObservationContext,
  ProviderVirtualDeclarationFact,
  TargetBindingFact,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpTargetMember,
} from "../target-types.js";
import {
  csharpTargetBindingFact,
} from "../target-types.js";
import type {
  CsharpOperationsProviderHost,
} from "../operations-provider.js";
import {
  getCsharpCheckedElementAccessRequestContext,
  getCsharpCheckedPropertyAccessRequestContext,
} from "../checked-member-access-request-context.js";
import {
  instantiateSelectedTargetMember,
} from "../selected-target-member-instantiation.js";
import {
  targetTypeRefEquals,
  targetTypeRefIsClosed,
  targetMemberIsClosed,
} from "../target-ref-utils.js";
import {
  findTargetMember,
  findTargetMemberForElementAccess,
} from "../target-member-selection.js";
import type {
  CheckedElementAccessContext,
  CheckedPropertyAccessContext,
} from "./types.js";

interface MemberAccessReceiverRequest {
  readonly receiverType?: ExtensionFactSubject | undefined;
  readonly receiver?: ExtensionFactSubject | undefined;
}

export interface SelectedTargetMemberIdentity {
  readonly selectedDeclaration: ProviderVirtualDeclarationFact | undefined;
  readonly member: CsharpTargetMember | undefined;
}

export function selectCheckedPropertyTargetMember(
  binding: TargetBindingFact,
  request: CheckedPropertyAccessMappingRequest,
  context: CheckedPropertyAccessContext,
): SelectedTargetMemberIdentity {
  const requestContext = getCsharpCheckedPropertyAccessRequestContext(request, context);
  const selectedDeclaration = resolveProviderVirtualDeclaration(context, [
    requestContext.sourceSelectedSymbol,
    requestContext.sourceSelectedDeclaration,
  ]);
  return {
    selectedDeclaration,
    member: findTargetMember(csharpTargetBindingFact(binding) ?? binding, selectedDeclaration),
  };
}

export function selectCheckedElementTargetMember(
  binding: TargetBindingFact,
  request: CheckedElementAccessMappingRequest,
  context: CheckedElementAccessContext,
  host: CsharpOperationsProviderHost,
  declaringTargetType: TargetTypeRef | undefined,
): SelectedTargetMemberIdentity {
  const requestContext = getCsharpCheckedElementAccessRequestContext(request, context);
  const selectedDeclaration = resolveProviderVirtualDeclaration(context, [
    requestContext.sourceSelectedSymbol,
    requestContext.sourceSelectedDeclaration,
  ]);
  return {
    selectedDeclaration,
    member: findTargetMemberForElementAccess(
      csharpTargetBindingFact(binding) ?? binding,
      selectedDeclaration,
      request,
      context,
      host.getTargetTypeRefForSubject,
      {
        getBaseTargetTypeRef: host.getBaseTargetTypeRef,
        getAssignableTargetTypeRefs: host.getAssignableTargetTypeRefs,
        ...(declaringTargetType !== undefined ? { declaringTargetType } : {}),
        ...(binding.typeParameters !== undefined ? { declaringTypeParameters: binding.typeParameters } : {}),
      },
    ),
  };
}

export function resolveProviderVirtualDeclaration(
  context: ExtensionObservationContext,
  subjects: readonly (ExtensionFactSubject | undefined)[],
): ProviderVirtualDeclarationFact | undefined {
  for (const subject of subjects) {
    if (subject === undefined) {
      continue;
    }
    const declaration = context.factResolver.resolve(subject, providerVirtualDeclarationFactKey);
    if (declaration !== undefined) {
      return declaration;
    }
  }
  return undefined;
}

export function getDeclaringTargetType(
  request: MemberAccessReceiverRequest,
  context: ExtensionObservationContext,
  host: CsharpOperationsProviderHost,
): TargetTypeRef | undefined {
  return host.getTargetTypeRefForSubject(request.receiver, context) ??
    host.getTargetTypeRefForSubject(request.receiverType, context);
}

export function instantiateClosedSelectedTargetMember(
  member: CsharpTargetMember,
  host: CsharpOperationsProviderHost,
  options: {
    readonly declaringTargetType?: TargetTypeRef;
    readonly selectedResultType?: TargetTypeRef;
  },
): CsharpTargetMember | undefined {
  const instantiated = instantiateSelectedTargetMember({ member }, host, {
    declaringTargetType: options.declaringTargetType,
  });
  if (instantiated === undefined) {
    return undefined;
  }
  const existingReturnType = instantiated.returnType;
  const closedReturnType = existingReturnType === undefined || targetTypeRefIsClosed(existingReturnType)
    ? existingReturnType
    : options.selectedResultType === undefined
      ? undefined
      : closeSelectedTargetResultType(existingReturnType, options.selectedResultType);
  if (existingReturnType !== undefined && closedReturnType === undefined) {
    return undefined;
  }
  const csharpMember = closedReturnType === existingReturnType
    ? instantiated
    : { ...instantiated, returnType: closedReturnType };
  return !targetMemberIsClosed(csharpMember)
    ? undefined
    : csharpMember as CsharpTargetMember;
}

function closeSelectedTargetResultType(
  openTargetType: TargetTypeRef,
  selectedSourceResultType: TargetTypeRef,
): TargetTypeRef | undefined {
  return closeTargetTypeRef(
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

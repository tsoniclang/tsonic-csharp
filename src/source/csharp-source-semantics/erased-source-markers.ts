import {
  attributeFactKey,
} from "@tsonic/tsts";
import type {
  AttributeFact,
  CheckedCallMappingRequest,
  ExtensionObservationContext,
  ProviderVirtualDeclarationFact,
  TargetMember,
} from "@tsonic/tsts";
import {
  csharpLangModule,
  neutralLangModule,
} from "./identity.js";

export function isErasedSourceSemanticsCall(declaration: ProviderVirtualDeclarationFact | undefined): declaration is ProviderVirtualDeclarationFact {
  if (declaration === undefined) {
    return false;
  }
  if (declaration.moduleSpecifier !== neutralLangModule && declaration.moduleSpecifier !== csharpLangModule) {
    return false;
  }
  return declaration.exportName === "attribute" ||
    declaration.exportName === "field" ||
    declaration.exportName === "struct" ||
    declaration.exportName === "defaultof" ||
    declaration.exportName === "out" ||
    declaration.exportName === "ref" ||
    declaration.exportName === "inref" ||
    declaration.exportName === "borrow" ||
    declaration.exportName === "borrowMut" ||
    declaration.exportName === "move" ||
    declaration.exportName === "__TsonicAttributeBuilder" ||
    declaration.exportName === "__TsonicAttributeMemberBuilder";
}

export function getCheckedAttributeBuilderFact(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): AttributeFact | undefined {
  return context.facts.get(request.call, attributeFactKey) ??
    context.facts.get(request.calleeReceiver, attributeFactKey);
}

export function erasedSourceSemanticsMember(
  declaration: ProviderVirtualDeclarationFact | undefined,
): TargetMember | undefined {
  const sourceName = declaration?.memberName ?? declaration?.exportName;
  const id = declaration?.signatureId ?? declaration?.memberId;
  if (sourceName === undefined || id === undefined) {
    return undefined;
  }
  return erasedMarkerMember(id, sourceName);
}

export function erasedAttributeFactMember(attribute: AttributeFact): TargetMember {
  return erasedMarkerMember(`source-semantics.attribute:${attribute.attributeName}`, "attribute");
}

function erasedMarkerMember(id: string, sourceName: string): TargetMember {
  return {
    id,
    sourceName,
    targetName: "__tsonic_erased_source_marker",
    kind: "method",
    parameters: [],
  };
}

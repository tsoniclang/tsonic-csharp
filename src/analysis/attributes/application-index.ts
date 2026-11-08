import type { Node, SourceFile } from "@tsonic/tsts";
import type { SourceAttributeBuilderFact, SourceResult, SourceTypeEvidence, TargetSourceProgram } from "@tsonic/target-api/source";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { admitCsharpAttributeArguments, diagnoseCsharpAttributeTypeValues, type CsharpAttributeArgumentEvidence } from "./type-validation.js";
import type { CsharpAttributeApplication, CsharpAttributeApplicationIndex } from "../../target-model/records/program/attributes.js";
import { csharpRepresentationDiagnostic, forwardSourceRefusal } from "../source-evidence/representations.js";

const emptyApplications: readonly CsharpAttributeApplication[] = Object.freeze([]);

export interface CsharpSourceAttributeApplicationIndex {
  readonly all: readonly Extract<SourceAttributeBuilderFact, { readonly kind: "application" }>[];
  forSubject(subject: Node): SourceAttributeBuilderFact | undefined;
}

export function createCsharpSourceAttributeApplicationIndex(
  source: TargetSourceProgram,
  sourceFiles: readonly SourceFile[],
): SourceResult<CsharpSourceAttributeApplicationIndex> {
  const all: Extract<SourceAttributeBuilderFact, { readonly kind: "application" }>[] = [];
  const bySubject = new Map<Node, SourceAttributeBuilderFact>();
  for (const occurrence of source.facts.navigation.nodesForFiles(sourceFiles)) {
    const selected = source.facts.protocols.attributeBuilder(occurrence);
    if (selected.kind === "refused") return selected;
    if (selected.value.kind === "none") continue;
    const fact = selected.value.value;
    if (fact.occurrence !== occurrence) failTargetAnalysisInvariant("tsonic-csharp",
      "An attribute publication must retain its identical original occurrence.", occurrence);
    bySubject.set(occurrence, fact);
    if (fact.kind === "application") all.push(fact);
  }
  return Object.freeze({ kind: "resolved", value: Object.freeze({ all: Object.freeze(all),
    forSubject: (subject: Node) => bySubject.get(subject) }) });
}

export function analyzeCsharpAttributeApplications(
  source: TargetSourceProgram,
  applications: CsharpSourceAttributeApplicationIndex,
  evidence: CsharpAttributeArgumentEvidence,
): { readonly index: CsharpAttributeApplicationIndex; readonly diagnostics: readonly TargetDiagnostic[] } {
  const diagnostics = [...diagnoseCsharpAttributeTypeValues(source, applications)];
  const invalidConstructions = new Set(diagnostics.map(diagnostic => diagnostic.sourceNode));
  const byDeclaration = new Map<Node, CsharpAttributeApplication[]>();
  const reject = (message: string, subject?: Node): void => {
    diagnostics.push({ code: "CSHARP_UNSUPPORTED_ATTRIBUTE_APPLICATION", category: "error", source: "tsonic-csharp",
      message: `C# attribute application ${message}`, ...(subject === undefined ? {} : { sourceNode: subject }) });
  };
  for (const application of applications.all) {
    if (invalidConstructions.has(application.invocation)) continue;
    const invocation = application.invocation;
    const member = application.selectedMember;
    const root = member.kind === "none" ? source.facts.navigation.declarationFor(application.applicationTarget) : undefined;
    const selected = member.kind === "present" ? member.value.selectedDeclaration.kind === "present"
      ? [member.value.selectedDeclaration.value] : member.value.declarations : root === undefined ? [] : [root];
    if (selected.length === 0) {
      reject("target must resolve to a project source declaration from finalized TSTS facts before C# emission.", invocation);
      continue;
    }
    const rejections = admitCsharpAttributeArguments(source, evidence, invocation);
    if (rejections.kind !== "represented") {
      diagnostics.push(csharpRepresentationDiagnostic(rejections));
      continue;
    }
    if (rejections.value.length > 0) {
      for (const rejection of rejections.value) reject(rejection.reason, rejection.node);
      continue;
    }
    for (const original of selected) attach(application, original);
  }
  for (const selectedApplications of byDeclaration.values()) Object.freeze(selectedApplications);
  return Object.freeze({
    diagnostics: Object.freeze(diagnostics),
    index: Object.freeze({
      attributeApplication: Object.freeze({ get: (declaration: Node) => byDeclaration.get(declaration) ?? emptyApplications }),
    }),
  });

  function attach(application: Extract<SourceAttributeBuilderFact, { readonly kind: "application" }>, selected: Node): void {
    const invocation = application.invocation;
    const selectedKind = source.ast.kindName(selected);
    const memberKind = application.applicationMemberKind;
    if (memberKind !== undefined && !memberKindMatches(memberKind, selectedKind)) {
      reject(`uses a ${memberKind} selector whose exact selected declaration is ${selectedKind}.`, invocation);
      return;
    }
    if (application.applicationPlacement === "constructor" && !source.ast.is.IsConstructorDeclaration(selected)) {
      const constructors = source.facts.navigation.classConstructors(selected);
      if (constructors.kind === "refused") {
        diagnostics.push(forwardSourceRefusal(constructors));
        return;
      }
      if (constructors.value.kind === "unresolved") {
        reject(constructors.value.reason, invocation);
        return;
      }
      const declarations = new Set(constructors.value.signatures.map(signature => signature.identity.declaration)
        .filter((declaration): declaration is Node => declaration !== undefined && source.ast.is.IsConstructorDeclaration(declaration)));
      if (constructors.value.witness !== "declared" || declarations.size === 0) {
        reject("requires an explicit source constructor declaration; implicit default constructors have no finalized source declaration to attach attributes to.", invocation);
        return;
      }
      for (const declaration of declarations) attach(application, declaration);
      return;
    }
    let subject: Node | undefined = selected;
    if (application.applicationParameterName !== undefined) {
      const parameters = originalParameters(selected);
      if (parameters.kind === "refused") {
        diagnostics.push(forwardSourceRefusal(parameters));
        return;
      }
      subject = parameters.value.find(parameter =>
        source.ast.text(source.ast.name(parameter)) === application.applicationParameterName);
    }
    if (subject === undefined) {
      reject(`could not find parameter '${application.applicationParameterName}' on the finalized source declaration target.`, invocation);
      return;
    }
    const specifier = application.applicationTargetSpecifier;
    if (specifier !== undefined && !isTargetSpecifier(specifier)) {
      reject(`uses unsupported explicit target specifier '${specifier}'. Supported C# attribute target specifiers are 'field', 'property', 'param', and 'return'.`, invocation);
      return;
    }
    if (specifier !== undefined && !targetSpecifierSupportsSubject(specifier, source.ast.kindName(subject))) {
      reject(`uses explicit target specifier '${specifier}' on ${source.ast.kindName(subject)}, which is outside the finalized C# attribute placement surface.`, invocation);
      return;
    }
    const applicationFact = Object.freeze({ invocation, ...(specifier === undefined ? {} : { targetSpecifier: specifier }) });
    const selectedApplications = byDeclaration.get(subject);
    if (selectedApplications === undefined) byDeclaration.set(subject, [applicationFact]);
    else selectedApplications.push(applicationFact);
  }

  function originalParameters(declaration: Node): SourceResult<readonly Node[]> {
    const slot = source.facts.values.declaredSlot(declaration);
    if (slot.kind === "refused") return slot;
    let value = slot.value.type;
    const visited = new Set<SourceTypeEvidence>();
    while (!visited.has(value)) {
      visited.add(value);
      const descriptor = value.type;
      if (descriptor.kind === "callable" || descriptor.kind === "shape") {
        const originals = [...descriptor.calls, ...descriptor.constructs]
          .filter(signature => signature.identity.declaration === declaration);
        if (originals.length !== 1) failTargetAnalysisInvariant("tsonic-csharp",
          "An attributed callable parameter requires its exact original declaration signature, not a selected overload.", declaration);
        const parameters = originals[0]!.parameters.map(parameter => parameter.declaration);
        if (parameters.some(parameter => parameter === undefined)) failTargetAnalysisInvariant("tsonic-csharp",
          "An attributed callable parameter requires every original authored parameter declaration.", declaration);
        return Object.freeze({ kind: "resolved", value: Object.freeze(parameters.filter((parameter): parameter is Node => parameter !== undefined)) });
      }
      const definition = descriptor.kind === "optional" ? source.facts.descriptors.component(value, { kind: "optional-value" })
        : source.facts.descriptors.definition(value);
      if (definition.kind === "refused") return definition;
      if (definition.value === value) break;
      value = definition.value;
    }
    return failTargetAnalysisInvariant("tsonic-csharp", "An attributed parameter requires its published original Source callable head.", declaration);
  }
}

function memberKindMatches(member: "property" | "method", kind: string): boolean {
  return member === "property"
    ? kind === "KindPropertyDeclaration" || kind === "KindPropertySignature" || kind === "KindGetAccessor" || kind === "KindSetAccessor"
    : kind === "KindMethodDeclaration" || kind === "KindMethodSignature" || kind === "KindFunctionDeclaration";
}

function isTargetSpecifier(specifier: string): specifier is NonNullable<CsharpAttributeApplication["targetSpecifier"]> {
  return specifier === "field" || specifier === "property" || specifier === "param" || specifier === "return";
}

function targetSpecifierSupportsSubject(specifier: NonNullable<CsharpAttributeApplication["targetSpecifier"]>, kind: string): boolean {
  switch (specifier) {
    case "field": return kind === "KindPropertyDeclaration";
    case "property": return memberKindMatches("property", kind);
    case "param": return kind === "KindParameter";
    case "return": return memberKindMatches("method", kind);
  }
}

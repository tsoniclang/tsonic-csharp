import type { Node, SourceFile } from "@tsonic/tsts";
import { isAstNode, type TargetSourceProgramFacts } from "@tsonic/target-api/source";
import { sourceProjectDeclaration } from "../program/source-facts.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { createTsonicAttributeApplicationFactIndex, type TsonicAttributeApplicationFactIndex } from "@tsonic/source-core/facts";
import { admitCsharpAttributeArguments, diagnoseCsharpAttributeTypeValues, type CsharpAttributeArgumentEvidence } from "./type-validation.js";
import type { CsharpAttributeApplication, CsharpAttributeApplicationIndex } from "../../target-model/records/program/attributes.js";

const emptyApplications: readonly CsharpAttributeApplication[] = Object.freeze([]);

export function createCsharpSourceAttributeApplicationIndex(
  source: Pick<TargetSourceProgramFacts, "syntax" | "sourceFacts">,
  sourceFiles: readonly SourceFile[],
): TsonicAttributeApplicationFactIndex {
  return createTsonicAttributeApplicationFactIndex({ ast: source.syntax, sourceFiles, sourceFacts: source.sourceFacts });
}

export function analyzeCsharpAttributeApplications(
  source: TargetSourceProgramFacts,
  applications: TsonicAttributeApplicationFactIndex,
  evidence: CsharpAttributeArgumentEvidence,
): { readonly index: CsharpAttributeApplicationIndex; readonly diagnostics: readonly TargetDiagnostic[] } {
  const diagnostics = [...diagnoseCsharpAttributeTypeValues(source, applications)];
  const byDeclaration = new Map<Node, CsharpAttributeApplication[]>();
  const reject = (message: string, subject?: Node): void => {
    diagnostics.push({ code: "CSHARP_UNSUPPORTED_ATTRIBUTE_APPLICATION", category: "error", source: "tsonic-csharp",
      message: `C# attribute application ${message}`, ...(subject === undefined ? {} : { sourceNode: subject }) });
  };
  for (const application of applications.all) {
    const invocation = isAstNode(source.syntax, application.invocation) ? application.invocation : undefined;
    const target = isAstNode(source.syntax, application.applicationTarget) ? application.applicationTarget : undefined;
    if (target === undefined) {
      reject("must carry an AST application target from finalized TSTS facts before C# emission.", invocation);
      continue;
    }
    const selected = isAstNode(source.syntax, application.selectedMember) ? application.selectedMember
      : sourceProjectDeclaration(source.facts, target);
    if (selected === undefined) {
      reject("target must resolve to a project source declaration from finalized TSTS facts before C# emission.", invocation);
      continue;
    }
    const selectedKind = source.syntax.kindName(selected);
    const memberKind = application.applicationMemberKind;
    if (memberKind !== undefined && !memberKindMatches(memberKind, selectedKind)) {
      reject(`uses a ${memberKind} selector whose exact selected declaration is ${selectedKind}.`, invocation);
      continue;
    }
    const declaration = application.applicationPlacement !== "constructor" || source.syntax.is.IsConstructorDeclaration(selected)
      ? selected : source.syntax.members(selected).find(member => member !== undefined && source.syntax.is.IsConstructorDeclaration(member));
    if (declaration === undefined) {
      reject("requires an explicit source constructor declaration; implicit default constructors have no finalized source declaration to attach attributes to.", invocation);
      continue;
    }
    const subject = application.applicationParameterName === undefined ? declaration
      : source.facts.analyses.callableValueParameters(declaration)?.find(parameter =>
        source.syntax.text(source.syntax.name(parameter)) === application.applicationParameterName);
    if (subject === undefined) {
      reject(`could not find parameter '${application.applicationParameterName}' on the finalized source declaration target.`, invocation);
      continue;
    }
    const specifier = application.applicationTargetSpecifier;
    if (specifier !== undefined && !isTargetSpecifier(specifier)) {
      reject(`uses unsupported explicit target specifier '${specifier}'. Supported C# attribute target specifiers are 'field', 'property', 'param', and 'return'.`, invocation);
      continue;
    }
    if (specifier !== undefined && !targetSpecifierSupportsSubject(specifier, source.syntax.kindName(subject))) {
      reject(`uses explicit target specifier '${specifier}' on ${source.syntax.kindName(subject)}, which is outside the finalized C# attribute placement surface.`, invocation);
      continue;
    }
    if (invocation === undefined) continue;
    const rejections = admitCsharpAttributeArguments(source, evidence, invocation);
    if (rejections.length > 0) {
      for (const rejection of rejections) reject(rejection.reason, rejection.node);
      continue;
    }
    const applicationFact = Object.freeze({ invocation, ...(specifier === undefined ? {} : { targetSpecifier: specifier }) });
    const selectedApplications = byDeclaration.get(subject);
    if (selectedApplications === undefined) byDeclaration.set(subject, [applicationFact]);
    else selectedApplications.push(applicationFact);
  }
  for (const selectedApplications of byDeclaration.values()) Object.freeze(selectedApplications);
  return Object.freeze({
    diagnostics: Object.freeze(diagnostics),
    index: Object.freeze({
      attributeApplication: Object.freeze({ get: (declaration: Node) => byDeclaration.get(declaration) ?? emptyApplications }),
    }),
  });
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

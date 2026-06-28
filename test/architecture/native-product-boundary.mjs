import { readdirSync, readFileSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import { join, relative, sep } from "node:path";

export const approvedProductPackages = Object.freeze([
  "@tsonic/source-core",
  "@tsonic/target-api",
  "@tsonic/tsts",
]);

export const nativeProductBoundaryCodeRules = Object.freeze([
  {
    id: "commonjs-require-call",
    pattern: new RegExp("\\b" + "require" + "\\s*\\(", "g"),
    replacement: "Use static ESM imports or explicit provider metadata instead of CommonJS require.",
    text: "code",
  },
  {
    id: "commonjs-import-equals-require",
    pattern: new RegExp("\\bimport\\s+[A-Za-z_$][\\w$]*\\s*=\\s*" + "require\\b", "g"),
    replacement: "Use ESM import syntax; TypeScript import-equals require is a CommonJS shim.",
    text: "code",
  },
  {
    id: "commonjs-export-equals",
    pattern: /\bexport\s*=/g,
    replacement: "Use ESM named/default exports instead of TypeScript CommonJS export assignment.",
    text: "code",
  },
  {
    id: "commonjs-module-exports-assignment",
    pattern: new RegExp("\\bmodule\\s*\\.\\s*exports\\s*=", "g"),
    replacement: "Use ESM exports; product code must not assign CommonJS module.exports.",
    text: "code",
  },
  {
    id: "commonjs-named-exports-assignment",
    pattern: new RegExp("\\bexports\\s*\\.\\s*[A-Za-z_$][\\w$]*\\s*=", "g"),
    replacement: "Use ESM exports; product code must not mutate CommonJS exports.",
    text: "code",
  },
  {
    id: "commonjs-dirname-filename",
    pattern: /\b__(?:dirname|filename)\b/g,
    replacement: "Use import.meta.url and node:url/node:path helpers in ESM code.",
    text: "code",
  },
  {
    id: "typescript-namespace-declaration",
    pattern: /\b(?:declare\s+)?namespace\s+[A-Za-z_$][\w$]*/g,
    replacement: "Use standard ECMAScript modules; TypeScript namespace declarations are banned.",
    text: "code",
  },
  {
    id: "typescript-ambient-module-shim",
    pattern: /\bdeclare\s+module\b/g,
    replacement: "Use explicit ESM package surfaces; ambient module shims are banned.",
    text: "code",
  },
  {
    id: "runtime-reflection-namespace",
    pattern: /\bSystem\s*\.\s*Reflection\b/g,
    replacement: "Runtime reflection is not language semantics; product paths must consume finalized provider facts.",
    text: "code",
  },
  {
    id: "runtime-reflection-member-discovery",
    pattern: /\.(?:GetProperty|GetProperties|GetMethod|GetMethods)\s*\(/g,
    replacement: "Do not discover target members at runtime; providers must supply closed target metadata before emission.",
    text: "code",
  },
  {
    id: "runtime-reflection-invocation",
    pattern: /\b(?:MethodInfo\s*\.\s*Invoke|Activator\s*\.\s*CreateInstance|Assembly\s*\.\s*Load)\s*\(/g,
    replacement: "Do not invoke or load runtime members as language semantics; emit deterministic diagnostics when facts are missing.",
    text: "code",
  },
  {
    id: "csharp-dynamic-semantics",
    pattern: /:\s*dynamic\b|\bdynamic\s+[A-Za-z_$][\w$]*\s*(?:=|;|,)/g,
    replacement: "C# dynamic is not a runtime semantics fallback; use explicit closed compat-runtime carrier facts or diagnose.",
    text: "code",
  },
  {
    id: "triple-slash-reference",
    pattern: /^\s*\/\/\/\s*<reference\b/gm,
    replacement: "Use explicit ESM imports or package configuration instead of triple-slash references.",
    text: "comment",
  },
]);

export const nativeProductBoundaryFileRules = Object.freeze([
  {
    id: "commonjs-source-extension",
    pattern: /\.(?:cjs|cts)$/,
    replacement: "Use ESM-only .mjs test files and .ts product source that emits ESM .js.",
  },
  {
    id: "procedural-policy-catch-all-file",
    pattern: /(?:^|\/)(?:policy|selection-policy|property-policy|array-use-policy|semantic-policy|operation-policy|runtime-policy|compat-policy)\.ts$/,
    replacement:
      "Use named facts, metadata, selectors, rule tables, or explicit exception modules instead of catch-all policy files.",
  },
  {
    id: "catch-all-semantic-blob-file",
    pattern: /(?:^|\/)(?:semantic|semantics|semantic-analysis|semantic-rules|analysis-rules|runtime-semantics|source-semantics|target-semantics)\.ts$/,
    replacement:
      "Split semantic behavior into source identity, provider metadata, finalized facts, lifecycle, or diagnostic modules.",
  },
]);

export const nativeProductBoundaryImportRules = Object.freeze([
  {
    id: "esm-relative-import-extension",
    replacement: "Relative product imports must spell the emitted .js extension.",
  },
  {
    id: "node-builtin-without-node-prefix",
    replacement: "Import Node built-ins through node: specifiers in ESM product source.",
  },
  {
    id: "unknown-node-builtin-import",
    replacement: "Use a real node: built-in module or move host/tooling behavior out of product source.",
  },
  {
    id: "unapproved-product-import",
    replacement: `Product source may import only approved first-party packages: ${approvedProductPackages.join(", ")}.`,
  },
]);

const approvedProductPackageSet = new Set(approvedProductPackages);
const nodeBuiltinSpecifiers = new Set(
  builtinModules.map((moduleName) =>
    moduleName.startsWith("node:") ? moduleName.slice("node:".length) : moduleName,
  ),
);
const productDependencySections = Object.freeze([
  "dependencies",
  "peerDependencies",
  "optionalDependencies",
  "bundledDependencies",
]);
const codeFileExtensions = Object.freeze([
  ".ts",
  ".mts",
  ".cts",
  ".js",
  ".mjs",
  ".cjs",
]);
const importSpecifierPattern =
  /\bimport\s+(?:type\s+)?(?:(?:["']([^"']+)["'])|(?:[^;]*?\bfrom\s+["']([^"']+)["']))|\bexport\s+(?:type\s+)?[^;]*?\bfrom\s+["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

export function collectNativeProductBoundaryFindings(repoRoot) {
  return sortFindings([
    ...collectNativeProductBoundarySourceFindings(repoRoot),
    ...collectNativeProductManifestFindings(repoRoot),
  ]);
}

export function collectNativeProductBoundarySourceFindings(repoRoot) {
  const sources = sourceAndTestSupportFiles(repoRoot).map((filePath) => ({
    file: repoRelative(repoRoot, filePath),
    text: readFileSync(filePath, "utf8"),
  }));
  return collectNativeProductBoundaryFindingsFromSources(sources);
}

export function collectNativeProductBoundaryFindingsFromSources(sources) {
  return sortFindings(sources.flatMap((source) => collectSourceFileFindings(source.file, source.text)));
}

export function collectNativeProductManifestFindings(repoRoot) {
  const packagePath = join(repoRoot, "package.json");
  return collectNativeProductManifestFindingsFromText("package.json", readFileSync(packagePath, "utf8"));
}

export function collectNativeProductManifestFindingsFromText(file, text) {
  const packageJson = JSON.parse(text);
  const findings = [];

  if (packageJson.type !== "module") {
    findings.push({
      file,
      ruleId: "package-type-module",
      line: manifestLine(text, "type"),
      snippet: "package.json type must be module",
      replacement: "Set package.json type to module so emitted JavaScript is ESM by default.",
    });
  }

  for (const section of productDependencySections) {
    const dependencies = packageJson[section];
    if (dependencies === undefined) {
      continue;
    }
    const dependencyNames = Array.isArray(dependencies) ? dependencies : Object.keys(dependencies);
    for (const dependencyName of dependencyNames) {
      if (!approvedProductPackageSet.has(dependencyName)) {
        findings.push({
          file,
          ruleId: "unapproved-product-dependency",
          line: manifestLine(text, dependencyName),
          snippet: `${section}.${dependencyName}`,
          replacement: `Product dependency manifests may list only ${approvedProductPackages.join(", ")}.`,
        });
      }
    }
  }

  return sortFindings(findings);
}

export function formatNativeProductBoundaryFinding(finding) {
  return `${finding.file}:${finding.line} ${finding.ruleId}: ${finding.snippet} -> ${finding.replacement}`;
}

function collectSourceFileFindings(file, text) {
  const codeText = maskNonCode(text);
  const commentText = maskStringsAndBlockComments(text);
  return [
    ...nativeProductBoundaryFileRules.flatMap((rule) => collectFileRuleFinding(file, rule)),
    ...nativeProductBoundaryCodeRules.flatMap((rule) =>
      collectPatternFindings(file, text, rule.text === "comment" ? commentText : codeText, rule),
    ),
    ...collectImportFindings(file, text, codeText),
  ];
}

function collectImportFindings(file, text, codeText) {
  if (!file.startsWith("src/")) {
    return [];
  }

  importSpecifierPattern.lastIndex = 0;
  const findings = [];
  for (const match of text.matchAll(importSpecifierPattern)) {
    if (!isCodeAt(codeText, match.index ?? 0)) {
      continue;
    }

    const specifier = match[1] ?? match[2] ?? match[3] ?? match[4];
    if (specifier === undefined) {
      continue;
    }

    findings.push(...collectSpecifierFindings(file, text, match.index ?? 0, specifier));
  }
  return findings;
}

function collectSpecifierFindings(file, text, index, specifier) {
  if (specifier.startsWith(".")) {
    return specifier.endsWith(".js")
      ? []
      : [finding(file, "esm-relative-import-extension", text, index, specifier)];
  }

  if (specifier.startsWith("node:")) {
    return nodeBuiltinSpecifiers.has(specifier.slice("node:".length))
      ? []
      : [finding(file, "unknown-node-builtin-import", text, index, specifier)];
  }

  if (nodeBuiltinSpecifiers.has(specifier)) {
    return [finding(file, "node-builtin-without-node-prefix", text, index, specifier)];
  }

  return approvedProductPackageSet.has(packageNameForSpecifier(specifier))
    ? []
    : [finding(file, "unapproved-product-import", text, index, specifier)];
}

function collectPatternFindings(file, rawText, searchText, rule) {
  rule.pattern.lastIndex = 0;
  return [...searchText.matchAll(rule.pattern)].map((match) => ({
    file,
    ruleId: rule.id,
    line: lineNumberAt(rawText, match.index ?? 0),
    snippet: lineAt(rawText, match.index ?? 0).trim(),
    replacement: rule.replacement,
  }));
}

function collectFileRuleFinding(file, rule) {
  rule.pattern.lastIndex = 0;
  return rule.pattern.test(file)
    ? [{
        file,
        ruleId: rule.id,
        line: 1,
        snippet: file,
        replacement: rule.replacement,
      }]
    : [];
}

function finding(file, ruleId, text, index, snippet) {
  const rule = nativeProductBoundaryImportRules.find((candidate) => candidate.id === ruleId);
  return {
    file,
    ruleId,
    line: lineNumberAt(text, index),
    snippet,
    replacement: rule?.replacement ?? "Fix the product-boundary rule violation.",
  };
}

function sourceAndTestSupportFiles(repoRoot) {
  return [
    ...filesUnder(join(repoRoot, "src")),
    ...filesUnder(join(repoRoot, "test")),
  ].filter((filePath) => codeFileExtensions.some((extension) => filePath.endsWith(extension)));
}

function filesUnder(directory) {
  return readdirSync(directory)
    .toSorted()
    .flatMap((entryName) => {
      const path = join(directory, entryName);
      return statSync(path).isDirectory() ? filesUnder(path) : [path];
    });
}

function maskNonCode(text) {
  const characters = text.split("");
  for (let index = 0; index < text.length; index += 1) {
    const current = text[index];
    const next = text[index + 1];

    if (current === "/" && next === "/") {
      index = maskUntilLineEnd(characters, text, index);
      continue;
    }
    if (current === "/" && next === "*") {
      index = maskBlockComment(characters, text, index);
      continue;
    }
    if (current === "\"" || current === "'") {
      index = maskQuotedString(characters, text, index, current);
      continue;
    }
    if (current === "`") {
      index = maskTemplate(characters, text, index);
    }
  }
  return characters.join("");
}

function maskStringsAndBlockComments(text) {
  const characters = text.split("");
  for (let index = 0; index < text.length; index += 1) {
    const current = text[index];
    const next = text[index + 1];

    if (current === "/" && next === "/") {
      index = skipUntilLineEnd(text, index);
      continue;
    }
    if (current === "/" && next === "*") {
      index = maskBlockComment(characters, text, index);
      continue;
    }
    if (current === "\"" || current === "'") {
      index = maskQuotedString(characters, text, index, current);
      continue;
    }
    if (current === "`") {
      index = maskTemplate(characters, text, index);
    }
  }
  return characters.join("");
}

function maskUntilLineEnd(characters, text, startIndex) {
  let index = startIndex;
  while (index < text.length && text[index] !== "\n") {
    characters[index] = " ";
    index += 1;
  }
  return index - 1;
}

function skipUntilLineEnd(text, startIndex) {
  let index = startIndex;
  while (index < text.length && text[index] !== "\n") {
    index += 1;
  }
  return index - 1;
}

function maskBlockComment(characters, text, startIndex) {
  let index = startIndex;
  while (index < text.length) {
    const current = text[index];
    const next = text[index + 1];
    characters[index] = current === "\n" ? "\n" : " ";
    if (current === "*" && next === "/") {
      characters[index + 1] = " ";
      return index + 1;
    }
    index += 1;
  }
  return text.length - 1;
}

function maskQuotedString(characters, text, startIndex, quote) {
  characters[startIndex] = " ";
  for (let index = startIndex + 1; index < text.length; index += 1) {
    const current = text[index];
    characters[index] = current === "\n" ? "\n" : " ";
    if (current === "\\") {
      index += 1;
      if (index < text.length) {
        characters[index] = text[index] === "\n" ? "\n" : " ";
      }
      continue;
    }
    if (current === quote) {
      return index;
    }
  }
  return text.length - 1;
}

function maskTemplate(characters, text, startIndex) {
  characters[startIndex] = " ";
  for (let index = startIndex + 1; index < text.length; index += 1) {
    const current = text[index];
    characters[index] = current === "\n" ? "\n" : " ";
    if (current === "\\") {
      index += 1;
      if (index < text.length) {
        characters[index] = text[index] === "\n" ? "\n" : " ";
      }
      continue;
    }
    if (current === "`") {
      return index;
    }
  }
  return text.length - 1;
}

function isCodeAt(codeText, index) {
  return codeText[index] !== " " && codeText[index] !== "\n" && codeText[index] !== "\r";
}

function packageNameForSpecifier(specifier) {
  if (specifier.startsWith("@")) {
    const [scope, name] = specifier.split("/");
    return `${scope}/${name}`;
  }
  return specifier.split("/")[0];
}

function manifestLine(text, key) {
  const index = text.indexOf(`"${key}"`);
  return index === -1 ? 1 : lineNumberAt(text, index);
}

function lineNumberAt(text, index) {
  let line = 1;
  for (let offset = 0; offset < index; offset += 1) {
    if (text.charCodeAt(offset) === 10) {
      line += 1;
    }
  }
  return line;
}

function lineAt(text, index) {
  const start = text.lastIndexOf("\n", index) + 1;
  const end = text.indexOf("\n", index);
  return text.slice(start, end === -1 ? text.length : end);
}

function repoRelative(repoRoot, path) {
  return relative(repoRoot, path).split(sep).join("/");
}

function sortFindings(findings) {
  return findings.toSorted((left, right) =>
    `${left.file}\u0000${left.line}\u0000${left.ruleId}`.localeCompare(
      `${right.file}\u0000${right.line}\u0000${right.ruleId}`,
    ),
  );
}

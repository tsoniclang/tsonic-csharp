using System.Collections.Concurrent;
using System.Reflection;
using System.Runtime.Loader;
using System.Text.Json;
using System.Text.Json.Serialization;

sealed record SourceReference(
    string Name,
    string ModuleSpecifier,
    string? TypeFamilyExportName = null,
    int? TypeFamilyTypeArgumentCount = null);

using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;

sealed partial class ReflectionProvider : IDisposable
{
    readonly Request request;
    readonly IReadOnlyDictionary<string, string> sourcePackageByAssemblyName;
    RequestMetadataLoadContext? requestLoadContext;
    Dictionary<string, SourceReference> providerSourceReferencesByTargetId = new(StringComparer.Ordinal);
    readonly HashSet<string> delegateSourceShapeInProgress = new(StringComparer.Ordinal);
    readonly Dictionary<string, string> delegateSourceShapeUnsupportedReasons = new(StringComparer.Ordinal);
    readonly NullabilityInfoContext nullability = new();
    Type[] activeModuleTypes = [];
    string moduleSpecifierPrefix = "";
    string activeNamespaceName;
    string activeModuleSpecifier;

    public ReflectionProvider(Request request)
    {
        this.request = request;
        ValidateSourcePackageName(request.SourcePackage);
        var sourcePackages = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var sourcePackage in request.AssemblySourcePackages)
        {
            if (string.IsNullOrWhiteSpace(sourcePackage.AssemblyName))
            {
                throw new InvalidOperationException("Assembly source package assembly name must not be empty.");
            }
            ValidateSourcePackageName(sourcePackage.PackageName);
            if (!sourcePackages.TryAdd(sourcePackage.AssemblyName, sourcePackage.PackageName))
            {
                throw new InvalidOperationException($"Duplicate assembly source package mapping for '{sourcePackage.AssemblyName}'.");
            }
        }
        sourcePackageByAssemblyName = sourcePackages;
        activeNamespaceName = request.NamespaceName;
        activeModuleSpecifier = request.ModuleSpecifier;
    }

    public object GetModule()
    {
        var loadedTypes = LoadPublicTypes();
        moduleSpecifierPrefix = GetModuleSpecifierPrefix();
        providerSourceReferencesByTargetId = SourceReferencesByTargetId(loadedTypes);
        return BuildModule(loadedTypes, activeNamespaceName, activeModuleSpecifier);
    }

    public object GetModules()
    {
        var loadedTypes = LoadPublicTypes();
        moduleSpecifierPrefix = request.ModuleSpecifierPrefix;
        providerSourceReferencesByTargetId = SourceReferencesByTargetId(loadedTypes);
        return loadedTypes
            .Where(IsTypeOwnedByActiveSourcePackage)
            .Where(type => type.Namespace is not null)
            .Select(type => type.Namespace!)
            .Distinct(StringComparer.Ordinal)
            .OrderBy(namespaceName => namespaceName, StringComparer.Ordinal)
            .Select(namespaceName => BuildModule(loadedTypes, namespaceName, ModuleSpecifierForNamespace(namespaceName)))
            .ToArray();
    }

    public void Dispose()
    {
        requestLoadContext?.Dispose();
        requestLoadContext = null;
    }

    Type[] LoadPublicTypes()
    {
        return LoadTypes()
            .Where(type => type.IsPublic || type.IsNestedPublic)
            .Where(type => !type.IsSpecialName)
            .Where(type => request.AssemblyName is null || StringComparer.Ordinal.Equals(type.Assembly.GetName().Name, request.AssemblyName))
            .GroupBy(TargetId, StringComparer.Ordinal)
            .Select(group => group.First())
            .OrderBy(type => TargetId(type), StringComparer.Ordinal)
            .ToArray();
    }

    object BuildModule(Type[] loadedTypes, string namespaceName, string moduleSpecifier)
    {
        activeNamespaceName = namespaceName;
        activeModuleSpecifier = moduleSpecifier;
        var allTypes = loadedTypes
            .Where(type => type.Namespace == activeNamespaceName)
            .Where(IsTypeOwnedByActiveSourcePackage)
            .ToArray();
        activeModuleTypes = allTypes;
        var assembly = ModuleAssemblyReference(allTypes);
        var requestedExports = request.Exports.Count == 0
            ? null
            : request.Exports.ToHashSet(StringComparer.Ordinal);
        var requestedTargetIds = request.TargetIds.Count == 0
            ? null
            : request.TargetIds.ToHashSet(StringComparer.Ordinal);
        var requestedMetadataNames = request.MetadataNames.Count == 0
            ? null
            : request.MetadataNames.ToHashSet(StringComparer.Ordinal);
        var requestedSlice = requestedExports is not null ||
            requestedTargetIds is not null ||
            requestedMetadataNames is not null;
        var sourceGroups = allTypes
            .Where(type => !HasProviderOwnedSourceProjection(type))
            .GroupBy(ProviderSourceExportName, StringComparer.Ordinal)
            .Select(group => new
            {
                SourceName = group.Key,
                AllTypes = group.OrderBy(TargetId, StringComparer.Ordinal).ToArray(),
            })
            .OrderBy(group => group.SourceName, StringComparer.Ordinal)
            .ToArray();
        var requestedSourceGroups = sourceGroups
            .Select(group => new
            {
                group.SourceName,
                group.AllTypes,
                RequestedTypes = group.AllTypes
                    .Where(type => IncludesRequestedType(type, requestedExports, requestedTargetIds, requestedMetadataNames))
                    .ToArray(),
            })
            .Where(group => group.RequestedTypes.Length > 0)
            .ToArray();
        var sourceExportableTargetIds = sourceGroups
            .Where(group => group.AllTypes.Length == 1 || IsProviderTypeFamilyGroup(group.SourceName, group.AllTypes))
            .SelectMany(group => group.AllTypes)
            .Where(type => UnsupportedSourceExportReason(type) is null)
            .Select(TargetId)
            .ToHashSet(StringComparer.Ordinal);
        var exportCandidates = requestedSourceGroups
            .Where(group => group.AllTypes.Length == 1 || IsProviderTypeFamilyGroup(group.SourceName, group.AllTypes))
            .SelectMany(group => group.AllTypes.Length == 1 ? group.RequestedTypes.Take(1) : group.AllTypes)
            .ToArray();
        var exportTypes = exportCandidates
            .Where(type => UnsupportedSourceExportReason(type) is null)
            .ToArray();
        var exportTypeNames = exportTypes.Select(TargetId).ToHashSet(StringComparer.Ordinal);
        var completeSourceTargetIds = CompleteSourceTargetIds(allTypes, sourceExportableTargetIds);
        var closureTypes = SourceClosureTypes(allTypes, exportTypes, sourceExportableTargetIds, completeSourceTargetIds);
        var unsupportedExports = requestedSourceGroups
            .Where(group => group.AllTypes.Length > 1 && !IsProviderTypeFamilyGroup(group.SourceName, group.AllTypes))
            .Select(group => ToUnsupportedTypeFamilyExport(group.SourceName, group.AllTypes))
            .Concat(exportCandidates
                .Select(type => ToUnsupportedTypeExport(type, UnsupportedSourceExportReason(type)))
                .Where(export => export is not null)
                .Cast<object>())
            .ToArray();
        var targetOnlyCandidates = requestedSlice
            ? allTypes.Where(type => IsRequestedTargetType(type, requestedTargetIds, requestedMetadataNames))
            : allTypes;
        var targetOnlyTypes = targetOnlyCandidates
            .Where(type => !exportTypeNames.Contains(TargetId(type)))
            .Select(type => ToTypeExport(type, true))
            .Where(export => export is not null)
            .Cast<object>()
            .ToArray();

        var sourceTypes = exportTypes
            .Concat(closureTypes)
            .DistinctBy(TargetId)
            .ToArray();
        var typeExports = sourceTypes
            .Select(type => ToTypeExport(type, completeSourceTargetIds.Contains(TargetId(type))))
            .Where(export => export is not null)
            .Cast<object>()
            .ToArray();
        var staticMemberExports = sourceTypes
            .Where(type => completeSourceTargetIds.Contains(TargetId(type)))
            .SelectMany(StaticSourceAdapterFunctions)
            .ToArray();
        var exports = typeExports.Concat(staticMemberExports).ToArray();

        return new
        {
            moduleSpecifier = activeModuleSpecifier,
            namespaceName = activeNamespaceName,
            assembly,
            exports,
            targetOnlyTypes = targetOnlyTypes.Length == 0 ? null : targetOnlyTypes,
            unsupportedExports = unsupportedExports.Length == 0 ? null : unsupportedExports,
        };
    }

    static void ValidateSourcePackageName(string packageName)
    {
        if (!System.Text.RegularExpressions.Regex.IsMatch(packageName, "^(?:@[a-z0-9][a-z0-9._-]*/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*)$", System.Text.RegularExpressions.RegexOptions.CultureInvariant))
        {
            throw new InvalidOperationException($"Invalid provider source package '{packageName}'.");
        }
    }

    bool IsTypeOwnedByActiveSourcePackage(Type type)
    {
        return StringComparer.Ordinal.Equals(SourcePackageForType(type), request.SourcePackage);
    }

    bool IncludesRequestedType(
        Type type,
        ISet<string>? requestedExports,
        ISet<string>? requestedTargetIds,
        ISet<string>? requestedMetadataNames)
    {
        if (requestedExports is null && requestedTargetIds is null && requestedMetadataNames is null)
        {
            return true;
        }
        return requestedExports?.Contains(ProviderSourceExportName(type)) == true ||
            requestedTargetIds?.Contains(TargetId(type)) == true ||
            requestedMetadataNames?.Contains(MetadataName(type)) == true;
    }

    bool IsProviderTypeFamilyGroup(string sourceName, IReadOnlyCollection<Type> types)
    {
        if (types.Count < 2)
        {
            return false;
        }
        var arities = new HashSet<int>();
        foreach (var type in types)
        {
            var family = ProviderSourceTypeFamily(type);
            if (family is null || family.Value.ExportName != sourceName || !arities.Add(family.Value.TypeArgumentCount))
            {
                return false;
            }
        }
        var ordered = arities.OrderBy(arity => arity).ToArray();
        for (var arity = ordered[0]; arity <= ordered[^1]; arity++)
        {
            if (!arities.Contains(arity))
            {
                return false;
            }
        }
        return true;
    }

    static bool IsRequestedTargetType(
        Type type,
        ISet<string>? requestedTargetIds,
        ISet<string>? requestedMetadataNames)
    {
        return requestedTargetIds?.Contains(TargetId(type)) == true ||
            requestedMetadataNames?.Contains(MetadataName(type)) == true;
    }

    static object? ModuleAssemblyReference(Type[] types)
    {
        var assemblies = types
            .Select(type => type.Assembly)
            .GroupBy(AssemblyIdentity, StringComparer.Ordinal)
            .ToArray();
        return assemblies.Length == 1 ? AssemblyReference(assemblies[0].First()) : null;
    }
}

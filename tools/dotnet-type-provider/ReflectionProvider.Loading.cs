using System.Reflection;
using System.Security.Cryptography;

sealed partial class ReflectionProvider
{
    IEnumerable<Type> LoadTypes()
    {
        RuntimeAssemblyRoots();
        var runtimePaths = RuntimeAssemblyPaths().ToHashSet(StringComparer.Ordinal);
        var referencePaths = ReferenceDirectoryAssemblyPaths()
            .Concat(ExplicitReferenceAssemblyPaths())
            .ToHashSet(StringComparer.Ordinal);
        requestLoadContext ??= new RequestMetadataLoadContext(
            runtimePaths,
            referencePaths,
            sourcePackageByAssemblyName.Keys);

        foreach (var entry in requestLoadContext.LoadRootAssemblies())
        {
            foreach (var type in ExportedTypes(entry.Assembly, entry.Path, entry.IsExplicitReference))
            {
                yield return type;
            }
        }
    }

    static void RuntimeAssemblyRoots()
    {
        _ = typeof(object);
        _ = typeof(Console);
        _ = typeof(Math);
        _ = typeof(List<>);
        _ = typeof(Dictionary<,>);
        _ = typeof(File);
        _ = typeof(Path);
        _ = typeof(Enumerable);
    }

    static IEnumerable<Type> ExportedTypes(Assembly assembly, string path, bool failOnError)
    {
        try
        {
            return assembly.GetExportedTypes();
        }
        catch (ReflectionTypeLoadException exception) when (!failOnError)
        {
            return exception.Types.Where(type => type is not null).Cast<Type>().ToArray();
        }
        catch (ReflectionTypeLoadException exception)
        {
            var loaderDetails = LoaderExceptionDetails(exception);
            throw new InvalidOperationException($"Unable to read exported types from explicit .NET reference assembly '{path}': {exception.Message}{loaderDetails}", exception);
        }
        catch (Exception) when (!failOnError)
        {
            return Array.Empty<Type>();
        }
        catch (Exception exception)
        {
            throw new InvalidOperationException($"Unable to read exported types from explicit .NET reference assembly '{path}': {exception.Message}", exception);
        }
    }

    static string LoaderExceptionDetails(ReflectionTypeLoadException exception)
    {
        var details = exception.LoaderExceptions
            .Where(loaderException => loaderException is not null)
            .Select(loaderException => loaderException!.Message)
            .Where(message => !string.IsNullOrWhiteSpace(message))
            .Distinct(StringComparer.Ordinal)
            .ToArray();
        return details.Length == 0
            ? ""
            : $" Loader exceptions: {string.Join(" | ", details)}";
    }

    IEnumerable<string> RuntimeAssemblyPaths()
    {
        var paths = new SortedSet<string>(StringComparer.Ordinal);
        var runtimeDirectory = Path.GetDirectoryName(typeof(object).Assembly.Location);
        if (runtimeDirectory is not null)
        {
            foreach (var path in Directory.EnumerateFiles(runtimeDirectory, "*.dll"))
            {
                paths.Add(Path.GetFullPath(path));
            }
        }
        return paths;
    }

    IEnumerable<string> ReferenceDirectoryAssemblyPaths()
    {
        var paths = new SortedSet<string>(StringComparer.Ordinal);
        if (request.ReferenceDirectory is not null && Directory.Exists(request.ReferenceDirectory))
        {
            foreach (var path in Directory.EnumerateFiles(request.ReferenceDirectory, "*.dll"))
            {
                paths.Add(Path.GetFullPath(path));
            }
        }
        else if (request.ReferenceDirectory is not null)
        {
            throw new InvalidOperationException($"Explicit .NET reference directory '{request.ReferenceDirectory}' does not exist.");
        }
        return paths;
    }

    IEnumerable<string> ExplicitReferenceAssemblyPaths()
    {
        var paths = new SortedSet<string>(StringComparer.Ordinal);
        foreach (var reference in request.References)
        {
            if (File.Exists(reference))
            {
                paths.Add(Path.GetFullPath(reference));
                continue;
            }
            throw new InvalidOperationException($"Explicit .NET reference assembly '{reference}' does not exist.");
        }
        return paths;
    }

    sealed class RequestMetadataLoadContext : IDisposable
    {
        readonly MetadataLoadContext context;
        readonly IReadOnlyList<AssemblyCandidate> rootCandidates;

        public RequestMetadataLoadContext(
            IReadOnlyCollection<string> runtimePaths,
            IReadOnlyCollection<string> referencePaths,
            IEnumerable<string> sourceAssemblyNames)
        {
            var sourceNames = sourceAssemblyNames.ToHashSet(StringComparer.Ordinal);
            var candidates = runtimePaths
                .Select(path => ReadCandidate(path, false))
                .Where(candidate => candidate is not null)
                .Cast<AssemblyCandidate>()
                .Concat(referencePaths.Select(path => ReadCandidate(path, true) ?? throw new InvalidOperationException($"Explicit .NET reference assembly '{path}' is not a managed assembly.")))
                .ToArray();
            var candidatesByIdentity = candidates
                .GroupBy(candidate => candidate.Identity, StringComparer.Ordinal)
                .ToDictionary(
                    group => group.Key,
                    group => SelectCanonicalCandidate(group, sourceNames),
                    StringComparer.Ordinal);
            rootCandidates = candidatesByIdentity.Values
                .OrderBy(candidate => candidate.Identity, StringComparer.Ordinal)
                .ToArray();
            context = new MetadataLoadContext(
                new PathAssemblyResolver(rootCandidates.Select(candidate => candidate.Path)),
                typeof(object).Assembly.GetName().Name!);
            ValidateExplicitReferenceClosure(candidatesByIdentity);
        }

        public IEnumerable<LoadedAssembly> LoadRootAssemblies()
        {
            foreach (var candidate in rootCandidates)
            {
                Assembly assembly;
                try
                {
                    assembly = context.LoadFromAssemblyPath(candidate.Path);
                }
                catch (Exception) when (!candidate.IsExplicitReference)
                {
                    continue;
                }
                catch (Exception exception)
                {
                    throw new InvalidOperationException($"Unable to read exported types from explicit .NET reference assembly '{candidate.Path}': {exception.Message}", exception);
                }
                yield return new LoadedAssembly(assembly, candidate.Path, candidate.IsExplicitReference);
            }
        }

        public void Dispose() => context.Dispose();

        void ValidateExplicitReferenceClosure(IReadOnlyDictionary<string, AssemblyCandidate> candidatesByIdentity)
        {
            foreach (var candidate in rootCandidates.Where(candidate => candidate.IsExplicitReference))
            {
                Assembly assembly;
                try
                {
                    assembly = context.LoadFromAssemblyPath(candidate.Path);
                }
                catch (Exception exception)
                {
                    throw new InvalidOperationException($"Unable to read exported types from explicit .NET reference assembly '{candidate.Path}': {exception.Message}", exception);
                }
                foreach (var reference in assembly.GetReferencedAssemblies())
                {
                    if (reference.FullName is not null && candidatesByIdentity.ContainsKey(reference.FullName))
                    {
                        continue;
                    }
                    throw new InvalidOperationException(
                        $"Unable to read exported types from explicit .NET reference assembly '{candidate.Path}': referenced assembly '{reference.FullName ?? reference.Name}' is not present in the deterministic reference set.");
                }
            }
        }

        static AssemblyCandidate SelectCanonicalCandidate(
            IEnumerable<AssemblyCandidate> values,
            IReadOnlySet<string> sourceAssemblyNames)
        {
            var candidates = values.OrderBy(candidate => candidate.Path, StringComparer.Ordinal).ToArray();
            var sourceOwned = sourceAssemblyNames.Contains(candidates[0].Name);
            var preferred = sourceOwned
                ? candidates.Where(candidate => candidate.IsExplicitReference).ToArray()
                : candidates.Where(candidate => !candidate.IsExplicitReference).ToArray();
            var eligible = preferred.Length > 0 ? preferred : candidates;
            var hashes = eligible.Select(candidate => candidate.ContentHash).Distinct(StringComparer.Ordinal).ToArray();
            if (hashes.Length > 1)
            {
                throw new InvalidOperationException(
                    $".NET provider assembly identity '{candidates[0].Identity}' resolves to multiple different explicit artifacts: {string.Join(", ", eligible.Select(candidate => candidate.Path))}.");
            }
            return eligible[0];
        }

        static AssemblyCandidate? ReadCandidate(string path, bool explicitReference)
        {
            AssemblyName assemblyName;
            try
            {
                assemblyName = AssemblyName.GetAssemblyName(path);
            }
            catch (BadImageFormatException) when (!explicitReference)
            {
                return null;
            }
            catch (Exception exception)
            {
                throw new InvalidOperationException($"Unable to read .NET assembly identity for '{path}': {exception.Message}", exception);
            }
            if (assemblyName.Name is null || assemblyName.FullName is null)
            {
                throw new InvalidOperationException($".NET assembly '{path}' has no complete assembly identity.");
            }
            using var stream = File.OpenRead(path);
            var contentHash = Convert.ToHexString(SHA256.HashData(stream)).ToLowerInvariant();
            return new AssemblyCandidate(
                Path.GetFullPath(path),
                assemblyName.Name,
                assemblyName.FullName,
                contentHash,
                explicitReference);
        }
    }

    sealed record AssemblyCandidate(
        string Path,
        string Name,
        string Identity,
        string ContentHash,
        bool IsExplicitReference);

    sealed record LoadedAssembly(Assembly Assembly, string Path, bool IsExplicitReference);
}

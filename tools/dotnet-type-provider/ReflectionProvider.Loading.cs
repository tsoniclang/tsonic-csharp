using System.Collections.Concurrent;
using System.Reflection;
using System.Runtime.Loader;
using System.Text.Json;
using System.Text.Json.Serialization;

sealed partial class ReflectionProvider
{
    IEnumerable<Type> LoadTypes()
    {
        RuntimeAssemblyRoots();
        var runtimePaths = RuntimeAssemblyPaths().ToHashSet(StringComparer.Ordinal);
        var referencePaths = ReferenceDirectoryAssemblyPaths()
            .Concat(ExplicitReferenceAssemblyPaths())
            .ToHashSet(StringComparer.Ordinal);
        var currentRequestPaths = runtimePaths
            .Concat(referencePaths)
            .ToHashSet(StringComparer.Ordinal);
        var resolver = new RequestAssemblyResolver(currentRequestPaths, assembliesByPath);
        AssemblyLoadContext.Default.Resolving += resolver.Resolve;
        try
        {
            var loadedPaths = new HashSet<string>(StringComparer.Ordinal);
            foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies())
            {
                if (string.IsNullOrEmpty(assembly.Location))
                {
                    continue;
                }
                var path = Path.GetFullPath(assembly.Location);
                if (!currentRequestPaths.Contains(path))
                {
                    continue;
                }
                loadedPaths.Add(path);
                foreach (var type in ExportedTypes(assembly, path, referencePaths.Contains(path)))
                {
                    yield return type;
                }
            }
            foreach (var path in currentRequestPaths.OrderBy(path => path, StringComparer.Ordinal))
            {
                if (loadedPaths.Contains(path))
                {
                    continue;
                }
                foreach (var type in LoadTypesFromAssemblyPath(path, failOnError: referencePaths.Contains(path)))
                {
                    yield return type;
                }
            }
        }
        finally
        {
            AssemblyLoadContext.Default.Resolving -= resolver.Resolve;
        }
    }

    IEnumerable<Type> LoadTypesFromAssemblyPath(string path, bool failOnError)
    {
        Assembly assembly;
        try
        {
            assembly = assembliesByPath.GetOrAdd(path, static candidate => AssemblyLoadContext.Default.LoadFromAssemblyPath(candidate));
        }
        catch (Exception) when (!failOnError)
        {
            return Array.Empty<Type>();
        }
        catch (Exception exception)
        {
            throw new InvalidOperationException($"Unable to load explicit .NET reference assembly '{path}': {exception.Message}", exception);
        }

        return ExportedTypes(assembly, path, failOnError);
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

    static IEnumerable<Type> ExportedTypes(Assembly assembly, string? path = null, bool failOnError = false)
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
            throw new InvalidOperationException($"Unable to read exported types from explicit .NET reference assembly '{path ?? assembly.FullName}': {exception.Message}{loaderDetails}", exception);
        }
        catch (Exception) when (!failOnError)
        {
            return Array.Empty<Type>();
        }
        catch (Exception exception)
        {
            throw new InvalidOperationException($"Unable to read exported types from explicit .NET reference assembly '{path ?? assembly.FullName}': {exception.Message}", exception);
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

    sealed class RequestAssemblyResolver
    {
        readonly ConcurrentDictionary<string, Assembly> assembliesByPath;
        readonly Dictionary<string, string> pathsBySimpleName;

        public RequestAssemblyResolver(IEnumerable<string> paths, ConcurrentDictionary<string, Assembly> assembliesByPath)
        {
            this.assembliesByPath = assembliesByPath;
            pathsBySimpleName = paths
                .Where(path => string.Equals(Path.GetExtension(path), ".dll", StringComparison.OrdinalIgnoreCase))
                .OrderBy(path => path, StringComparer.Ordinal)
                .GroupBy(path => Path.GetFileNameWithoutExtension(path), StringComparer.Ordinal)
                .ToDictionary(group => group.Key, group => group.First(), StringComparer.Ordinal);
        }

        public Assembly? Resolve(AssemblyLoadContext context, AssemblyName assemblyName)
        {
            if (assemblyName.Name is null || !pathsBySimpleName.TryGetValue(assemblyName.Name, out var path))
            {
                return null;
            }
            return assembliesByPath.GetOrAdd(path, static candidate => AssemblyLoadContext.Default.LoadFromAssemblyPath(candidate));
        }
    }
}

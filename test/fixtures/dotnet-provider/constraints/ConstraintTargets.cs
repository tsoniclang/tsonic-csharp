namespace ProviderConstraintFixtures;

public interface ITagged
{
}

public interface IProducer<out T>
{
    T Produce();
}

public interface IConsumer<in T>
{
    void Consume(T value);
}

public abstract class EntityBase
{
}

public sealed class TaggableEntity : EntityBase, ITagged
{
    public TaggableEntity()
    {
    }
}

public sealed class ReferenceNewTarget<T>
    where T : class, ITagged, new()
{
    public void Copy<TMethod>(TMethod value)
        where TMethod : EntityBase, ITagged, new()
    {
    }
}

public sealed class StructTarget<T>
    where T : struct
{
}

public sealed class UnmanagedTarget<T>
    where T : unmanaged
{
}

public sealed class NotNullTarget<T>
    where T : notnull
{
}

public readonly struct NativeCategoryValue : ITagged
{
}

public enum NativeCategoryEnum
{
    Zero,
    One,
}

public delegate int NativeCategoryCallback(int value);

public sealed class NativeCategoryGeneric<T> where T : EntityBase
{
}

public static class NativeCategoryBounds
{
    public static bool FromBase<T>(T value) where T : EntityBase => true;
    public static bool FromInterface<T>(T value) where T : ITagged => true;
    public static bool FromDelegate<T>(T value) where T : System.Delegate => true;
}

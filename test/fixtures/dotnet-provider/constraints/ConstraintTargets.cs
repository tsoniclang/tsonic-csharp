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

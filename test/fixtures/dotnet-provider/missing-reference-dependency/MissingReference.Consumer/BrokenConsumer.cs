using MissingReference.Dependency;

namespace MissingReference.Consumer;

public sealed class BrokenConsumer : DependencyBase
{
    public override string Name => "broken";
}

public sealed class LoadableConsumer
{
    public string Name => "loadable";
}

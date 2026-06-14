var builder = DistributedApplication.CreateBuilder(args);

var api = builder.AddProject<Projects.SapAssistant_Api>("api");

builder.AddNpmApp("web", "../SapAssistant.Web", "dev")
    .WithReference(api)
    .WaitFor(api)
    .WithHttpEndpoint(env: "PORT", targetPort: 5173)
    .WithExternalHttpEndpoints();

builder.Build().Run();

using Microsoft.AspNetCore.HttpOverrides;
using SapAssistant.Api.Auth;
using SapAssistant.Api.Chat;
using SapAssistant.Api.Endpoints;
using SapAssistant.Api.Storage;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.Services.AddOpenApi();

builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedProto | ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedHost;
    options.KnownNetworks.Clear();
    options.KnownProxies.Clear();
});

builder.Services.AddSapAuth(builder.Configuration, builder.Environment);

builder.Services.AddSingleton<IContestRepository, InMemoryContestRepository>();
builder.Services.AddSingleton<IChatService, StubChatService>();

var app = builder.Build();

app.UseForwardedHeaders();

app.MapDefaultEndpoints();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}
else
{
    app.UseHttpsRedirection();
}

// In a deployed image, the React SPA lives in wwwroot/ alongside the API.
// Locally (Aspire) wwwroot is empty and Vite serves the SPA, so this is a no-op.
app.UseDefaultFiles();
app.UseStaticFiles();

app.UseAuthentication();
app.UseAuthorization();

var api = app.MapGroup("/api");
api.MapGet("/hello", () => new { message = "Hello from SapAssistant.Api", utc = DateTime.UtcNow })
   .WithName("Hello");

app.MapAccountEndpoints(builder.Configuration, app.Environment);
app.MapContestEndpoints();
app.MapChatEndpoints();

var authDisabled = builder.Configuration.GetValue<bool>("Auth:Disable")
                   || app.Environment.EnvironmentName == "Testing";
if (authDisabled)
{
    app.MapTestAuthEndpoints();
}

// SPA fallback: any non-API GET that doesn't match a file falls through to index.html
// so React Router handles deep links like /contest, /chat, etc.
//
// Register whenever the SPA is served from this origin (i.e. wwwroot/index.html
// exists). That covers prod AND dev's run-local-real-auth.ps1 launcher
// (Development env + single-origin). When Aspire/Vite is hosting the SPA on a
// different port, wwwroot/index.html is absent, so this is a no-op.
var wwwrootIndex = Path.Combine(app.Environment.WebRootPath ?? "", "index.html");
if (File.Exists(wwwrootIndex))
{
    app.MapFallbackToFile("index.html");
}

app.Run();

public partial class Program;

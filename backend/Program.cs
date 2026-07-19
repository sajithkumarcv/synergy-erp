using ERPWEB.Dbcontext;
using ERPWEB.Middleware;
using ERPWEB.Security;
using ERPWEB.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;

var builder = WebApplication.CreateBuilder(args);

// 1. CORS
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowReactApp", policy =>
    {
        policy.AllowAnyOrigin()
       .AllowAnyHeader()
       .AllowAnyMethod();
              
    });
});

// 2. JWT Authentication
var jwtKey = builder.Configuration["Jwt:Key"] ?? throw new InvalidOperationException("Jwt:Key is not configured.");
builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        ValidIssuer = builder.Configuration["Jwt:Issuer"],
        ValidAudience = builder.Configuration["Jwt:Audience"],
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey))
    };
});

// 3. Controllers & Swagger (with JWT support in Swagger UI)
builder.Services.AddControllers()
    .AddJsonOptions(o => {
        o.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
        // HTML <select> / <input> always yield strings, so numeric FKs (e.g. countryId)
        // arrive as "2" not 2. Accept quoted numbers so int/decimal binds don't 400.
        // Purely permissive — plain numbers still bind exactly as before.
        o.JsonSerializerOptions.NumberHandling = JsonNumberHandling.AllowReadingFromString;
    })
    .ConfigureApiBehaviorOptions(o =>
    {
        // Log model binding / validation failures that would otherwise silently return 400
        // before the controller action runs.
        o.InvalidModelStateResponseFactory = ctx =>
        {
            var dbcon  = ctx.HttpContext.RequestServices.GetRequiredService<DbCon>();
            var errors = string.Join(" | ", ctx.ModelState.Values
                .SelectMany(v => v.Errors)
                .Select(e => e.ErrorMessage));
            var fakeEx = new Exception($"Model binding failed: {errors}");
            var rv = ctx.ActionDescriptor.RouteValues;
            _ = dbcon.WriteLog(fakeEx,
                controller:  rv.TryGetValue("controller", out var ctrl)   ? ctrl   : null,
                action:      rv.TryGetValue("action",     out var act)    ? act    : null,
                requestPath: ctx.HttpContext.Request.Path);
            return new Microsoft.AspNetCore.Mvc.BadRequestObjectResult(new { message = errors });
        };
    });
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo { Title = "ERPWEB API", Version = "v1" });

    // Adds the "Authorize" button in Swagger UI
    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.ApiKey,
        Scheme = "Bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
        Description = "Enter: Bearer {your token}"
    });
    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference
                {
                    Type = ReferenceType.SecurityScheme,
                    Id   = "Bearer"
                }
            },
            Array.Empty<string>()
        }
    });
});

// 3b. Per-IP throttle on the login endpoint (backstop to the per-account
// lockout in sp_ValidateUser, which a distributed username-spray would dodge).
// The limit is deliberately loose: a whole office can share one NAT address,
// so it must not trip on a normal 9am sign-in rush — it only has to make
// automated guessing pointless.
builder.Services.AddMemoryCache();   // backs the OnRejected log throttle below
builder.Services.AddRateLimiter(options =>
{
    options.AddPolicy(RateLimitPolicies.Login, ctx =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = builder.Configuration.GetValue<int>("RateLimit:Login:PermitLimit", 20),
                Window      = TimeSpan.FromMinutes(builder.Configuration.GetValue<int>("RateLimit:Login:WindowMinutes", 1)),
                QueueLimit  = 0
            }));

    options.OnRejected = async (ctx, ct) =>
    {
        var ip = ctx.HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";

        // One row per IP per interval. Rejecting a request must stay cheap: a row
        // per rejection would let a flood turn our own audit log into its
        // amplifier — the exact cost the limiter exists to avoid. The cache entry
        // expires itself, so the key set can't grow without bound either.
        var cache = ctx.HttpContext.RequestServices.GetRequiredService<IMemoryCache>();
        if (!cache.TryGetValue($"ratelimit-logged:{ip}", out _))
        {
            cache.Set($"ratelimit-logged:{ip}", true, TimeSpan.FromMinutes(5));
            var dbcon = ctx.HttpContext.RequestServices.GetRequiredService<DbCon>();
            await dbcon.WriteRawLog(
                message:     $"Login rate limit tripped — too many attempts from {ip}.",
                controller:  "RateLimiter",
                action:      "OnRejected",
                requestPath: ctx.HttpContext.Request.Path,
                ipAddress:   ip,
                logLevel:    "Warning");
        }

        ctx.HttpContext.Response.StatusCode  = StatusCodes.Status429TooManyRequests;
        ctx.HttpContext.Response.ContentType = "application/json";
        await ctx.HttpContext.Response.WriteAsJsonAsync(new
        {
            code    = "RATE_LIMITED",
            message = "Too many sign-in attempts. Please wait a moment and try again."
        }, ct);
    };
});

// 4. Register services
builder.Services.AddSingleton<LicenseService>();
builder.Services.AddScoped<DbCon>();
builder.Services.AddScoped<JwtService>();
builder.Services.AddScoped<EmailService>();
builder.Services.AddScoped<ERPWEB.Services.EmailAlertProcessorService>();
builder.Services.AddHostedService<ERPWEB.Services.AlertSchedulerService>();
builder.Services.AddHostedService<ERPWEB.Services.CreditHoldSchedulerService>();

var app = builder.Build();

// 5. Middleware pipeline
//if (app.Environment.IsDevelopment())
//{
    app.UseSwagger();
    app.UseSwaggerUI();
//}

app.UseCors("AllowReactApp");       // CORS before everything
app.UseRateLimiter();               // before auth: unauthenticated login floods must be capped too
if (!app.Environment.IsDevelopment())
    app.UseMiddleware<LicenseMiddleware>();
app.UseStaticFiles();               // serves wwwroot (uploads, logos, etc.)
app.UseHttpsRedirection();
app.UseAuthentication();            // MUST come before UseAuthorization
app.UseMiddleware<SessionValidationMiddleware>();   // single-PC session enforcement (needs the authenticated user)
app.UseAuthorization();

app.MapControllers();

app.Run();

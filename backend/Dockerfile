# Build context must be the repository root (Render default).
# docker-compose also uses repo root — see docker-compose.yml.
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY backend/backend.csproj ./backend/
RUN dotnet restore ./backend/backend.csproj

COPY backend/ ./backend/
# Bust publish cache when source changes (Render sometimes reuses stale layers).
ARG CACHE_BUST=2026-07-28-cors1
RUN echo "cache_bust=$CACHE_BUST" && dotnet publish ./backend/backend.csproj -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /app/data

COPY --from=build /app/publish .

# Bind all interfaces; Render injects PORT at runtime (Program.cs also respects PORT).
ENV ASPNETCORE_URLS=http://+:5000

# Default for local docker-compose (SQLite). On Render override with Postgres Internal URL.
ENV ConnectionStrings__DefaultConnection=DataSource=/app/data/learnchain.db

# Avoid inotify crashes on shared hosts.
ENV DOTNET_USE_POLLING_FILE_WATCHER=true
ENV DOTNET_hostBuilder__reloadConfigOnChange=false

# Free-tier memory: disable diagnostics / use workstation GC (reduces SIGSEGV/OOM risk).
ENV DOTNET_EnableDiagnostics=0
ENV DOTNET_GCServer=0
ENV DOTNET_NOLOGO=1

EXPOSE 5000

# Render uses its own health check (/health). Skip Docker HEALTHCHECK to avoid
# false kills when PORT differs from the image default.
ENTRYPOINT ["dotnet", "backend.dll"]

{ pkgs, ... }:
{
  packages = with pkgs; [
    nodejs_20
    docker
    docker-compose
    git
  ];

  enterShell = ''
    echo "Collab dev shell ready"
    echo "Run: devenv up"
  '';

  processes = {
    web.exec = "npm run dev";
    api.exec = "npm run dev:api";
    ws.exec = "npm run dev:ws";
  };

  scripts = {
    deps.exec = "docker compose up -d postgres redis livekit";
  };
}


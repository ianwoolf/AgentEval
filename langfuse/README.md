# Local Langfuse

Official upstream Docker Compose deployment, with project name fixed to `langfuse`.

```powershell
docker compose -p langfuse -f langfuse/docker-compose.yml up -d
docker compose -p langfuse -f langfuse/docker-compose.yml ps
docker compose -p langfuse -f langfuse/docker-compose.yml logs --tail 100 langfuse-web langfuse-worker
docker compose -p langfuse -f langfuse/docker-compose.yml stop
```

Open http://localhost:3000 and register your local account, then create a project and API keys.
Secrets are generated in `.env` (ignored by Git). Keep this file to preserve access to encrypted data.
The old `.env.example` contains demo credentials; the installation does not use them.
Data persists in named Docker volumes. Do not remove volumes unless intentionally deleting the installation.

Source: https://langfuse.com/self-hosting/deployment/docker-compose

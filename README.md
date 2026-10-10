# PodShip

A self-hosted, Vercel-style deployment platform. Give it a GitHub repo URL and it builds the project in an isolated container, hosts the output on S3, and serves it on its own subdomain while streaming build logs live.

## Architecture

- **Build server**: each build runs in its own Docker container on AWS ECS Fargate. It clones the repo, installs dependencies, builds the static output, uploads it to S3 under the project slug, and exits.
- **S3 reverse proxy**: an `http-proxy` server on port 8000 resolves the subdomain and proxies requests directly to the project's path in S3.
- **Real-time logs**: the build container publishes logs to Redis Pub/Sub; the API server subscribes and relays them to clients over Socket.IO.
- **API server**: an Express REST API that accepts a GitHub URL, generates a project slug, and launches an ECS task with the required environment overrides.

## Tech Stack

Node.js · Express · Docker · AWS ECS Fargate · Amazon S3 · Redis · Socket.IO

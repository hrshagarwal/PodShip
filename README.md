# PodShip

A self-hosted, Vercel-style deployment platform. Give it a GitHub repo URL and it builds the project in an isolated container, hosts the output on S3, and serves it on its own subdomain while streaming build logs live.

## Architecture

```mermaid
flowchart LR
    User([User / Browser])

    subgraph Local["Servers"]
        API["API Server<br/>Express :9000"]
        Socket["Socket Server<br/>Socket.IO :9001"]
        Proxy["Reverse Proxy<br/>http-proxy :8000"]
    end

    subgraph AWS["AWS (ap-south-1)"]
        ECR[("ECR<br/>build-server image")]
        subgraph ECS["ECS Cluster (Fargate)"]
            Builder["Build Container<br/>clone → install → build → upload"]
        end
        S3[("S3 Bucket<br/>__outputs/#lt;slug#gt;/")]
    end

    GitHub[(GitHub Repo)]
    Redis[("Redis<br/>Pub/Sub")]

    User -- "POST /project { gitURL }" --> API
    API -- "RunTask + env overrides" --> Builder
    ECR -. "image pull" .-> Builder
    Builder -- "git clone" --> GitHub
    Builder -- "upload dist/" --> S3
    Builder -- "PUBLISH logs:#lt;slug#gt;" --> Redis
    Redis -- "PSUBSCRIBE logs:*" --> Socket
    Socket -- "live logs (WebSocket)" --> User
    User -- "#lt;slug#gt;.localhost:8000" --> Proxy
    Proxy -- "stream from __outputs/#lt;slug#gt;/" --> S3
```

### Deploy flow

```mermaid
sequenceDiagram
    participant U as User
    participant A as API Server
    participant E as ECS Fargate
    participant R as Redis
    participant S as S3
    participant P as Reverse Proxy

    U->>A: POST /project { gitURL, slug? }
    A->>E: RunTask (PROJECT_ID, GIT_REPOSITORY__URL)
    A-->>U: { status: "queued", url }
    U->>A: socket.emit("subscribe", "logs:#lt;slug#gt;")
    E->>E: git clone, npm install, npm run build
    E->>R: publish build logs
    R-->>A: pmessage logs:#lt;slug#gt;
    A-->>U: live logs over Socket.IO
    E->>S: upload dist/ to __outputs/#lt;slug#gt;/
    E->>R: publish "Done"
    U->>P: GET #lt;slug#gt;.localhost:8000
    P->>S: proxy to __outputs/#lt;slug#gt;/index.html
    S-->>U: static site (streamed)
```

## Components

- **Build server** (`build-server/`): a Docker image run as an ECS Fargate task per deploy. It clones the repo, runs `npm install` and `npm run build`, uploads `dist/` to S3 with correct content types, streams logs to Redis, and exits.
- **API server** (`api-server/`): an Express REST API that accepts a GitHub URL (and an optional custom slug), generates a project slug, and launches the build task with per-deploy environment overrides. It also runs a Socket.IO server that relays build logs from Redis to subscribed clients.
- **S3 reverse proxy** (`s3-reverse-proxy/`): maps `<slug>.localhost:8000` to `__outputs/<slug>/` in S3 and streams responses instead of buffering files in memory.

## Tech Stack

Node.js · Express · Docker · AWS ECS Fargate · Amazon ECR · Amazon S3 · Redis · Socket.IO

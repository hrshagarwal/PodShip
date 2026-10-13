# PodShip

A self-hosted, Vercel-style deployment platform. Give it a GitHub repo URL and it builds the project in an isolated container, hosts the output on S3, and serves it on its own subdomain while streaming build logs live.

## Architecture

![PodShip architecture](docs/architecture.png)

<details>
<summary>Same architecture as a Mermaid diagram</summary>

```mermaid
flowchart LR
    Client(["Client"]) -->|"POST /project"| API["API Server<br/>:9000"]

    GitHub[("GitHub")]

    subgraph ECS["AWS ECS · Fargate (image from AWS ECR)"]
        B1["build-server"]
        B2["build-server"]
        B3["build-server"]
    end

    API --> B1
    API -->|"git url"| B2
    API --> B3
    GitHub -.->|"git clone"| ECS

    B1 -->|"logs"| Redis[("Redis<br/>Pub/Sub")]
    B2 --> Redis
    B3 --> Redis
    B1 --> S3[("S3<br/>__outputs/{project_id}/")]
    B2 -->|"dist/ (index.html, assets/)"| S3
    B3 --> S3

    Redis --> Socket["Socket Server<br/>:9001"]
    Socket --> User(["User"])

    A1(["a1.localhost:8000"]) --> Proxy["Reverse Proxy<br/>s3-reverse-proxy :8000"]
    P1(["p1.localhost:8000"]) --> Proxy
    Proxy -->|"__outputs/{project_id}/"| S3
```

</details>

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
    S-->>P: file stream
    P-->>U: static site (streamed)
```

## Components

- **Build server** (`build-server/`): a Docker image run as an ECS Fargate task per deploy. It clones the repo, runs `npm install` and `npm run build`, uploads `dist/` to S3 with correct content types, streams logs to Redis, and exits.
- **API server** (`api-server/`): an Express REST API that accepts a GitHub URL (and an optional custom slug), generates a project slug, and launches the build task with per-deploy environment overrides. It also runs a Socket.IO server that relays build logs from Redis to subscribed clients.
- **S3 reverse proxy** (`s3-reverse-proxy/`): maps `<slug>.localhost:8000` to `__outputs/<slug>/` in S3 and streams responses instead of buffering files in memory.

## Tech Stack

Node.js · Express · Docker · AWS ECS Fargate · Amazon ECR · Amazon S3 · Redis · Socket.IO

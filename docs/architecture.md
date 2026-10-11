# QuickNotes Architecture

This document describes how QuickNotes moves from a browser-only app to an online service used by 1 million people.

## 1. Requirements

### Functional requirements

- Users can register and log in.
- Users can create, view, edit and delete their own notes.
- Users can list their notes, with pagination, search and sorting.
- Users can organise notes with tags and filter by tag.
- Notes are saved on the server, so they are available from any device.

### Non-functional requirements

| Requirement         | Target                                                                           |
| ------------------- | -------------------------------------------------------------------------------- |
| **Scalability**     | Support 1 million registered users and grow without a redesign                   |
| **Availability**    | 99.9% uptime; no single point of failure                                         |
| **Latency**         | `GET /notes` under 200 ms (95th percentile); `POST /notes` under 300 ms          |
| **Durability**      | Saved notes are never lost (replication and daily backups)                       |
| **Security**        | HTTPS everywhere, hashed passwords, users can only access their own data         |
| **Consistency**     | A user sees their own new note immediately; other views may lag by a few seconds |
| **Maintainability** | Stateless servers that can be added or replaced without downtime                 |

## 2. Load estimate (1 million users)

### Assumptions

- Registered users: **1,000,000**
- Daily active users (DAU): 20% → **200,000 users/day**
- Each active user opens or refreshes their note list **20 times/day** (reads)
- Each active user creates **2 notes/day** (writes)
- Average stored note (title, body, tags and metadata): **2 KB**
- Peak traffic is **5×** the average
- Seconds per day: 24 × 60 × 60 = **86,400**

### Calculations

| Metric                          | Calculation        | Result            |
| ------------------------------- | ------------------ | ----------------- |
| Reads per day                   | 200,000 × 20       | 4,000,000         |
| **Reads per second (average)**  | 4,000,000 / 86,400 | **≈ 46.3 /s**     |
| Reads per second (peak)         | 46.3 × 5           | ≈ 231.5 /s        |
| Writes per day                  | 200,000 × 2        | 400,000           |
| **Writes per second (average)** | 400,000 / 86,400   | **≈ 4.6 /s**      |
| Writes per second (peak)        | 4.6 × 5            | ≈ 23.1 /s         |
| Storage per day                 | 400,000 × 2 KB     | 800 MB            |
| **Storage per year**            | 0.8 GB × 365       | **≈ 292 GB/year** |

**Read-to-write ratio:** 10 : 1, so QuickNotes is **read-heavy**. This justifies a cache and read replicas. The numbers are small enough for one primary database, so the main reason for the extra components is availability rather than raw capacity.

## 3. Architecture diagram

```text
                          ┌───────────────┐
                          │    Client     │
                          │ (browser/app) │
                          └───────┬───────┘
                                  │ 1. resolve api.quicknotes.example
                                  ▼
                          ┌───────────────┐
                          │      DNS      │
                          └───────┬───────┘
                                  │
                ┌─────────────────┴─────────────────┐
                │ static files (HTML/JS/CSS)        │ API calls (/notes, /tags)
                ▼                                   ▼
        ┌───────────────┐                   ┌───────────────┐
        │      CDN      │                   │ Load Balancer │
        └───────────────┘                   └───────┬───────┘
                                                    │
                                     ┌──────────────┴──────────────┐
                                     ▼                             ▼
                              ┌─────────────┐               ┌─────────────┐
                              │ App Server 1│               │ App Server 2│  (... N)
                              └──────┬──────┘               └──────┬──────┘
                                     │                             │
              ┌──────────────────────┼─────────────────────────────┤
              │                      │                             │
              ▼                      ▼                             ▼
        ┌───────────┐       ┌─────────────────┐            ┌───────────────┐
        │   Cache   │       │   Primary DB    │            │ Message Queue │
        │  (Redis)  │       │   (writes)      │            └───────┬───────┘
        └───────────┘       └────────┬────────┘                    │
                                     │ replication                 ▼
                                     ▼                      ┌─────────────┐
                            ┌─────────────────┐             │   Worker    │
                            │  Read Replica   │             └──────┬──────┘
                            │   (reads)       │                    │
                            └─────────────────┘                    │
                                     ▲                             │
                                     └──────── updates ────────────┘
                                       (search index, tag counts)
```

## 4. Components

- **Client:** The browser app (our `index.html` and `api.js`) that shows notes and sends API requests on the user's behalf.
- **DNS:** Translates `api.quicknotes.example` into the address of the load balancer, so users can find the service and we can move servers without changing the name.
- **CDN:** Serves the static HTML, CSS and JavaScript from servers close to the user, which reduces load time and keeps that traffic off our app servers.
- **Load Balancer:** Spreads incoming API requests across the app servers and stops sending traffic to any server that fails its health check, so one slow or dead server does not take the service down.
- **App Servers (2 or more):** Run the API logic (authentication, validation, reading and writing notes); because they keep no local state, we can add more when traffic grows.
- **Cache (Redis):** Keeps recently read note lists in memory, which solves the problem of the database being hit with the same read query again and again.
- **Primary Database (PostgreSQL):** Is the single source of truth that safely stores every user, note and tag, and accepts all writes.
- **Read Replica:** Keeps a live copy of the primary database to handle read queries, which solves the problem of reads slowing down writes and gives us a ready standby if the primary fails.
- **Message Queue:** Holds background jobs (such as search indexing and tag counts) so the API can respond to the user without waiting for slow work.
- **Worker:** Takes jobs from the queue and runs them in the background, which solves the problem of slow tasks making a request time out.

## 5. Request flows

### `GET /notes`

1. The client sends `GET /v1/notes?page=1` with its access token. DNS resolves the API hostname.
2. The load balancer receives the request and forwards it to a healthy app server.
3. The app server verifies the token and identifies the user.
4. The app server checks the **cache** for this user's notes page (key such as `notes:user:7:page:1`).
5. **Cache hit:** it returns the cached JSON immediately (go to step 8).
6. **Cache miss:** it queries a **read replica** for the user's notes (`ORDER BY created_at DESC LIMIT 20`).
7. The app server stores the result in the cache with a short expiry (for example 60 seconds).
8. The app server returns `200 OK` with the notes, and the response travels back through the load balancer to the client.

### `POST /notes`

1. The client sends `POST /v1/notes` with the JSON body and its access token.
2. The load balancer forwards the request to a healthy app server.
3. The app server verifies the token and **validates** the body (title required, at most 100 characters).
4. If validation fails, it returns `400 Bad Request` with an error body.
5. The app server inserts the note into the **primary database** (and the `note_tags` rows if tags were sent) inside one transaction.
6. The app server **invalidates** the user's cached note pages so the next read shows the new note.
7. The app server places a job on the **message queue** (for example `index_note` with the note id) and does not wait for it.
8. The app server returns `201 Created` with the new note and a `Location` header.
9. Later, a **worker** takes the job from the queue and updates the search index and tag counts. If the job fails, it is retried.

## 6. Trade-offs

### Trade-off 1: Cache and read replicas give speed, but reads can be slightly stale

- **Benefit:** Most reads are served from memory or a replica, so the primary database stays fast and the 10:1 read load is easy to handle.
- **Cost:** Replication takes a short time, and cached pages live for up to 60 seconds, so data seen by a read can be a little old.
- **Mitigation:** On writes we delete the user's cached pages, and right after a write the client uses the response it just received. A user therefore sees their own note immediately, while other devices catch up within seconds. For a notes app, this is a better deal than slower reads.

### Trade-off 2: A queue and worker make saving fast, but add complexity

- **Benefit:** `POST /notes` returns as soon as the note is stored; slow follow-up work happens in the background, so traffic spikes do not cause timeouts.
- **Cost:** We must run, monitor and scale the queue and workers, handle retries, and accept that search results can lag behind by a moment.
- **Mitigation:** Jobs are written to be **idempotent** (safe to run twice), failed jobs go to a dead-letter queue for review, and the core data is already safely stored in the database before any job runs.

### Trade-off 3: One primary database keeps data correct, but limits write scaling

- **Benefit:** A single writer avoids conflicts and keeps data consistent with simple SQL transactions.
- **Cost:** Writes cannot be spread across many servers. At 23 writes per second in the peak, this is not a problem for 1 million users.
- **Mitigation:** If writes ever outgrow one machine, we can shard the database by `user_id`, because each user's data is independent.

## 7. Avoiding single points of failure

| Component        | How a single failure is avoided                                                                                                                      |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| DNS              | Use a managed DNS service that runs on many servers worldwide (optionally a second provider).                                                        |
| CDN              | Runs in many edge locations; if one fails, requests go to another.                                                                                   |
| Load balancer    | Run a pair (or a managed, multi-zone load balancer) with automatic failover.                                                                         |
| App servers      | Run 2 or more, in different availability zones; the load balancer removes any failed server.                                                         |
| Cache            | Run Redis with a replica and automatic failover. If the cache is down entirely, the app falls back to the database, which is slower but still works. |
| Primary database | Keep a synchronous or near-synchronous standby; the read replica can be promoted to primary automatically if the primary fails. Take daily backups.  |
| Read replica     | Run at least two replicas; if one fails, the others (or the primary) handle reads.                                                                   |
| Message queue    | Use a replicated or managed queue so messages survive a node failure.                                                                                |
| Worker           | Run several workers; if one dies, an unacknowledged job is given to another.                                                                         |

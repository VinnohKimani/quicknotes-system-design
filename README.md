# QuickNotes System Design

QuickNotes is a notes app moving from a browser-only app to an online service for 1 million users. This project has two parts:

1. **An API client** (`index.html`, `api.js`, `style.css`) that proves the front end can talk to a REST API. It uses the [JSONPlaceholder](https://jsonplaceholder.typicode.com) practice API to load, create and delete notes.
2. **Design documents** that the backend team can build from: the API, the data model and the system architecture.

## How to run the API client

The client is plain HTML, CSS and JavaScript, so it needs no build step or install.

1. Clone the repository:
   ```bash
   git clone https://github.com/VinnohKimani/quicknotes-system-design
   cd quicknotes-system-design
   ```
2. Open `index.html` in your browser (double-click it), **or** serve the folder locally:
   ```bash
   python3 -m http.server 8000
   ```
   then visit <http://localhost:8000>.
3. Use the page:
   - Select **Load notes** to fetch 10 notes (`GET`).
   - Fill in the form and select **Add note** to create one (`POST`). The title is required and can be at most 100 characters.
   - Select **Delete** on a note to remove it (`DELETE`).

> **Note:** JSONPlaceholder is a fake API. It accepts new notes and deletions and responds as if they worked, but it does not save them. A created note is removed from the page only, and a deleted server note returns the next time you load notes. The explanation is in the comments in `api.js`.

## Project structure

```text
quicknotes-system-design/
├── index.html
├── api.js
├── style.css
├── README.md
└── docs/
    ├── api-design.md
    ├── data-model.md
    └── architecture.md
```

## Documents

- [API design](docs/api-design.md): REST endpoints, JSON examples and error codes.
- [Data model](docs/data-model.md): tables, relationships, SQL, indexes and the SQL vs NoSQL decision.
- [Architecture](docs/architecture.md): requirements, load estimate, diagram, request flows and trade-offs.

## What I learned

- **Always check `response.ok` when using `fetch`.** `fetch` only rejects on network failures, not on `404` or `500`, so a reusable `request()` function that throws on bad statuses keeps error handling in one place.
- **Show every state of a request.** Loading, success, error and empty states, plus disabled buttons while a request runs, stop double submits and tell the user what is happening.
- **Insert user text with `textContent`, not `innerHTML`.** This prevents cross-site scripting (XSS) from note titles and bodies.
- **Back-of-the-envelope estimates guide the design.** Turning 1 million users into about 46 reads/s, 5 writes/s and about 292 GB/year showed that the app is read-heavy, which is why a cache and read replicas make sense.
- **Every extra component solves one problem and adds a cost.** Caching adds stale data and queues add complexity, so each choice needs a trade-off and a plan to avoid single points of failure.
- **A fake API behaves differently from a real one.** Because JSONPlaceholder doesn't store data, I had to decide how created and deleted notes should behave and document it.

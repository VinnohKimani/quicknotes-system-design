# QuickNotes API Design

This document describes the REST API the backend team will build for QuickNotes.

## 1. Conventions

- **Base URL:** `https://api.quicknotes.example/v1`
- **Format:** All requests and responses use JSON (`Content-Type: application/json`).
- **Authentication:** `Authorization: Bearer <access_token>` on every endpoint except register and login.
- **Resources are plural nouns** (`/notes`, `/tags`); the HTTP method describes the action.
- **Ownership:** A user can only see and change their own notes and tags.
- **Timestamps:** ISO 8601 in UTC, for example `2026-10-11T09:30:00Z`.

## 2. Endpoints

| #   | Method   | Path                       | Description                                                                  | Success status   |
| --- | -------- | -------------------------- | ---------------------------------------------------------------------------- | ---------------- |
| 1   | `POST`   | `/auth/register`           | Create a new user account                                                    | `201 Created`    |
| 2   | `POST`   | `/auth/login`              | Log in and receive an access token                                           | `200 OK`         |
| 3   | `GET`    | `/notes`                   | List the current user's notes (supports `page`, `limit`, `tag`, `q`, `sort`) | `200 OK`         |
| 4   | `POST`   | `/notes`                   | Create a note                                                                | `201 Created`    |
| 5   | `GET`    | `/notes/{id}`              | Get one note                                                                 | `200 OK`         |
| 6   | `PUT`    | `/notes/{id}`              | Replace a note (title and body required)                                     | `200 OK`         |
| 7   | `PATCH`  | `/notes/{id}`              | Partially update a note (for example only the body)                          | `200 OK`         |
| 8   | `DELETE` | `/notes/{id}`              | Delete a note                                                                | `204 No Content` |
| 9   | `GET`    | `/tags`                    | List the current user's tags                                                 | `200 OK`         |
| 10  | `POST`   | `/tags`                    | Create a tag                                                                 | `201 Created`    |
| 11  | `PUT`    | `/notes/{id}/tags/{tagId}` | Attach a tag to a note (safe to repeat)                                      | `204 No Content` |
| 12  | `DELETE` | `/notes/{id}/tags/{tagId}` | Remove a tag from a note                                                     | `204 No Content` |

### Query parameters for `GET /notes`

| Parameter | Example       | Meaning                                                            |
| --------- | ------------- | ------------------------------------------------------------------ |
| `page`    | `1`           | Page number, starting at 1 (default `1`)                           |
| `limit`   | `20`          | Notes per page, maximum 100 (default `20`)                         |
| `tag`     | `work`        | Only notes with this tag                                           |
| `q`       | `groceries`   | Search in title and body                                           |
| `sort`    | `-created_at` | Sort field; a leading `-` means descending (default `-created_at`) |

## 3. Examples

### 3.1 Create a note — `POST /notes`

**Request**

```http
POST /v1/notes
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Content-Type: application/json
```

```json
{
  "title": "Buy groceries",
  "body": "Milk, eggs, bread and coffee.",
  "tags": ["personal", "shopping"]
}
```

**Response — `201 Created`**

```http
Location: /v1/notes/101
```

```json
{
  "id": 101,
  "userId": 7,
  "title": "Buy groceries",
  "body": "Milk, eggs, bread and coffee.",
  "tags": ["personal", "shopping"],
  "createdAt": "2026-10-11T09:30:00Z",
  "updatedAt": "2026-10-11T09:30:00Z"
}
```

### 3.2 List notes — `GET /notes?page=1&limit=2&sort=-created_at`

**Response — `200 OK`**

```json
{
  "data": [
    {
      "id": 101,
      "userId": 7,
      "title": "Buy groceries",
      "body": "Milk, eggs, bread and coffee.",
      "tags": ["personal", "shopping"],
      "createdAt": "2026-10-11T09:30:00Z",
      "updatedAt": "2026-10-11T09:30:00Z"
    },
    {
      "id": 100,
      "userId": 7,
      "title": "Project ideas",
      "body": "Build a notes app with an API.",
      "tags": ["work"],
      "createdAt": "2026-10-10T16:05:12Z",
      "updatedAt": "2026-10-10T16:05:12Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 2,
    "totalItems": 48,
    "totalPages": 24
  }
}
```

## 4. Error responses

Every error uses the same JSON body so clients can handle failures in one place.

### Example error body

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request body is invalid.",
    "details": [
      { "field": "title", "issue": "Title must be 100 characters or fewer." }
    ],
    "requestId": "req_8f3a2c1d"
  }
}
```

### Status codes

| Status                      | Code               | When it happens                                     | Example                                                                  |
| --------------------------- | ------------------ | --------------------------------------------------- | ------------------------------------------------------------------------ |
| `400 Bad Request`           | `VALIDATION_ERROR` | Malformed JSON or invalid fields                    | `POST /notes` with an empty title or a title over 100 characters         |
| `401 Unauthorized`          | `UNAUTHENTICATED`  | Token missing, invalid or expired                   | Calling `GET /notes` without an `Authorization` header                   |
| `403 Forbidden`             | `FORBIDDEN`        | Valid user, but not allowed to access this resource | Deleting another user's note                                             |
| `404 Not Found`             | `NOT_FOUND`        | The resource does not exist                         | `GET /notes/99999`                                                       |
| `409 Conflict`              | `CONFLICT`         | The request clashes with existing data              | Registering an email that is already used; creating a duplicate tag name |
| `429 Too Many Requests`     | `RATE_LIMITED`     | Client exceeded the rate limit                      | More than 100 requests per minute from one user                          |
| `500 Internal Server Error` | `INTERNAL_ERROR`   | Unexpected server failure                           | Database unreachable; the response never exposes internal details        |

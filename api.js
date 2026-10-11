"use strict";

const API_URL = "https://jsonplaceholder.typicode.com/posts";
const NOTE_LIMIT = 10;
const MAX_TITLE_LENGTH = 100;

const loadBtn = document.getElementById("load-btn");
const statusEl = document.getElementById("status");
const form = document.getElementById("note-form");
const titleInput = document.getElementById("title-input");
const bodyInput = document.getElementById("body-input");
const submitBtn = document.getElementById("submit-btn");
const notesList = document.getElementById("notes-list");

/*App state */
let notes = []; // the notes currently shown on the page
let isBusy = false; // true while any request is running

async function request(url, options = {}) {
  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  // Some responses ( have no useful body, so a JSON
  // parse failure should not be treated as an error.
  const data = await response.json().catch(() => null);
  return { status: response.status, data };
}

// GET - load the first 10 notes
async function fetchNotes() {
  const { data } = await request(`${API_URL}?_limit=${NOTE_LIMIT}`);
  return data;
}

async function createNoteRequest(note) {
  return request(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify(note),
  });
}

async function deleteNoteRequest(id) {
  return request(`${API_URL}/${id}`, { method: "DELETE" });
}

function setStatus(message, type) {
  statusEl.textContent = message; // textContent only - never innerHTML
  statusEl.className = `status status--${type}`;
}

// Disables or enables every button while a request is running.
function setBusy(value) {
  isBusy = value;
  loadBtn.disabled = value;
  submitBtn.disabled = value;
  document.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.disabled = value;
  });
}

// Re-draws the list. All user text is inserted with textContent only.
function renderNotes() {
  notesList.replaceChildren();

  // Empty state
  if (notes.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = "No notes yet. Select Load notes or add one above.";
    notesList.appendChild(empty);
    return;
  }

  notes.forEach((note) => {
    const item = document.createElement("li");
    item.className = "note";

    const content = document.createElement("div");
    content.className = "note-content";

    const title = document.createElement("h3");
    title.textContent = note.title;

    const body = document.createElement("p");
    body.textContent = note.body || "";

    content.append(title, body);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "delete-btn";
    deleteBtn.textContent = "Delete";
    deleteBtn.setAttribute("aria-label", `Delete note: ${note.title}`);
    deleteBtn.disabled = isBusy;
    deleteBtn.addEventListener("click", () => handleDelete(note));

    item.append(content, deleteBtn);
    notesList.appendChild(item);
  });
}

// Returns an error message, and an empty string when the title is valid.
function validateTitle(title) {
  if (title.length === 0) {
    return "Enter a title for your note.";
  }
  if (title.length > MAX_TITLE_LENGTH) {
    return `The title is ${title.length} characters. Shorten it to ${MAX_TITLE_LENGTH} or fewer.`;
  }
  return "";
}

async function handleLoad() {
  if (isBusy) return;

  setBusy(true);
  setStatus("Loading notes...", "loading");

  try {
    const data = await fetchNotes();
    notes = Array.isArray(data) ? data : [];
    renderNotes();

    if (notes.length === 0) {
      setStatus("The server has no notes to show.", "info");
    } else {
      setStatus(`Loaded ${notes.length} notes from the server.`, "success");
    }
  } catch (error) {
    console.error("Load failed:", error);
    setStatus(
      "Couldn't load notes. Check your connection and try again.",
      "error",
    );
  } finally {
    setBusy(false);
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  if (isBusy) return;

  const title = titleInput.value.trim();
  const body = bodyInput.value.trim();

  // Validation: title is required, max 100 characters. Body is optional.
  const validationError = validateTitle(title);
  if (validationError) {
    setStatus(validationError, "error");
    titleInput.focus();
    return;
  }

  setBusy(true);
  setStatus("Saving note...", "loading");

  try {
    const { status, data } = await createNoteRequest({
      title,
      body,
      userId: 1,
    });

    // Add the returned note to the top of the list.
    // `local: true` marks notes that only exist in this page (see handleDelete).
    notes.unshift({ ...data, local: true });
    renderNotes();

    // Clear the form only after a successful save so a failed
    // request does not make the user retype their note.
    form.reset();

    setStatus(`Note created (status ${status}, id ${data.id}).`, "success");
  } catch (error) {
    console.error("Create failed:", error);
    setStatus("Couldn't save the note. Try again.", "error");
  } finally {
    setBusy(false);
  }
}

async function handleDelete(note) {
  if (isBusy) return;

  setBusy(true);
  setStatus("Deleting note...", "loading");

  try {
    if (!note.local) {
      await deleteNoteRequest(note.id);
    }

    notes = notes.filter((item) => item !== note);
    renderNotes();
    setStatus("Note deleted.", "success");
  } catch (error) {
    console.error("Delete failed:", error);
    setStatus("Couldn't delete the note. Try again.", "error");
  } finally {
    setBusy(false);
  }
}

loadBtn.addEventListener("click", handleLoad);
form.addEventListener("submit", handleSubmit);
renderNotes();

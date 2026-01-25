const toastTargets = document.querySelectorAll('[data-toast="true"]');
const authButtons = {
  google: [
    document.getElementById("googleSignIn"),
    document.getElementById("googleSignInAlt"),
    document.getElementById("googleSignInLock"),
  ].filter(Boolean),
  facebook: [
    document.getElementById("facebookSignIn"),
    document.getElementById("facebookSignInAlt"),
    document.getElementById("facebookSignInLock"),
  ].filter(Boolean),
};
const signOutBtn = document.getElementById("signOutBtn");
const userBadge = document.getElementById("userBadge");
const authSections = document.querySelectorAll("[data-auth]");
const emptyStates = document.querySelectorAll("[data-empty]");
const postForm = document.getElementById("postForm");
const postType = document.getElementById("postType");
const postTitleField = document.getElementById("postTitleField");
const postBodyField = document.getElementById("postBodyField");
const postListField = document.getElementById("postListField");
const postTitle = document.getElementById("postTitle");
const postBody = document.getElementById("postBody");
const postListItem = document.getElementById("postListItem");
const postLinkTitle = document.getElementById("postLinkTitle");
const postLinkUrl = document.getElementById("postLinkUrl");
const postName = postForm?.querySelector('input[name="name"]');

const firebaseConfig = window.__FIREBASE_CONFIG__ || {};

const collections = {
  announcements: "announcements",
  messages: "messages",
  events: "events",
  shows: "shows",
  auditions: "auditions",
  editorInvites: "editorInvites",
};

let db = null;
let auth = null;
let currentUser = null;
let isEditor = false;
let listeners = [];
let editorInviteUnsubscribe = null;
let deleteHandlerWired = false;

const showToast = (message) => {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add("toast-visible");
  });

  setTimeout(() => {
    toast.classList.remove("toast-visible");
    setTimeout(() => toast.remove(), 300);
  }, 2500);
};

let authUnavailableWired = false;
const wireAuthUnavailable = () => {
  if (authUnavailableWired) {
    return;
  }
  authUnavailableWired = true;
  const message =
    "Sign-in isn't configured yet. Add your Firebase keys and enable providers.";
  authButtons.google.forEach((button) => {
    button.addEventListener("click", () => showToast(message));
  });
  authButtons.facebook.forEach((button) => {
    button.addEventListener("click", () => showToast(message));
  });
};

const setAuthVisibility = (signedIn) => {
  authSections.forEach((section) => {
    const desiredState = section.getAttribute("data-auth");
    const isSignedIn = desiredState === "signed-in";
    section.style.display = signedIn === isSignedIn ? "" : "none";
  });
};

const setRoleVisibility = (role) => {
  document.body.classList.remove("role-editor", "role-viewer");
  if (role) {
    document.body.classList.add(`role-${role}`);
  }

  document.querySelectorAll("[data-role]").forEach((element) => {
    const desiredRole = element.getAttribute("data-role");
    if (desiredRole === role) {
      const display = element.getAttribute("data-role-display") || "";
      element.style.display = display;
    } else {
      element.style.display = "none";
    }
  });
};

const subscribeEditorStatus = (email) => {
  if (!db) {
    return;
  }

  if (editorInviteUnsubscribe) {
    editorInviteUnsubscribe();
    editorInviteUnsubscribe = null;
  }

  if (!email) {
    isEditor = false;
    setRoleVisibility("viewer");
    return;
  }

  const normalizedEmail = email.toLowerCase();
  editorInviteUnsubscribe = db
    .collection(collections.editorInvites)
    .doc(normalizedEmail)
    .onSnapshot((doc) => {
      isEditor = doc.exists;
      setRoleVisibility(isEditor ? "editor" : "viewer");
      if (!isEditor) {
        toggleEditMode(false);
      }
    });
};

const setEmptyState = (key, hasItems) => {
  emptyStates.forEach((element) => {
    if (element.getAttribute("data-empty") === key) {
      element.style.display = hasItems ? "none" : "";
    }
  });
};

const formatDate = (timestamp) => {
  if (!timestamp) {
    return "Date TBD";
  }
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
};

const normalizeUrl = (url) => {
  if (!url) {
    return "";
  }
  if (/^https?:\/\//i.test(url)) {
    return url;
  }
  return `https://${url}`;
};

const fetchLinkPreview = async (url) => {
  if (!url) {
    return { title: "", image: "" };
  }
  try {
    const response = await fetch(
      `/.netlify/functions/link-preview?url=${encodeURIComponent(url)}`
    );
    if (!response.ok) {
      return { title: "", image: "" };
    }
    return await response.json();
  } catch (error) {
    return { title: "", image: "" };
  }
};

const applyEditableState = (enabled) => {
  document.body.classList.toggle("edit-mode", enabled);
  document.querySelectorAll("[data-editable]").forEach((element) => {
    element.contentEditable = enabled ? "true" : "false";
    element.setAttribute("spellcheck", enabled ? "true" : "false");
  });
};

const clearContainers = () => {
  document.querySelectorAll("[data-container]").forEach((container) => {
    container.innerHTML = "";
  });
  document.querySelectorAll("[data-list-id]").forEach((list) => {
    list.innerHTML = "";
  });
  setEmptyState("announcements", false);
  setEmptyState("messages", false);
  setEmptyState("events", false);
  setEmptyState("shows", false);
  setEmptyState("auditions", false);
};

const updatePostFields = () => {
  if (!postType) {
    return;
  }
  const type = postType.value;
  const isListType = type === "shows" || type === "auditions";
  if (postTitleField) {
    postTitleField.hidden = isListType;
  }
  if (postBodyField) {
    postBodyField.hidden = isListType;
  }
  if (postListField) {
    postListField.hidden = !isListType;
  }
};

const renderAnnouncements = (docs) => {
  const container = document.querySelector('[data-container="announcements"]');
  if (!container) {
    return;
  }
  container.innerHTML = "";
  docs.forEach((doc) => {
    const data = doc.data();
    const meta = data.authorName
      ? `Posted by ${data.authorName} · ${formatDate(data.createdAt)}`
      : formatDate(data.createdAt);
    const card = document.createElement("article");
    card.className = "card";
    card.dataset.docId = doc.id;
    card.dataset.itemType = "announcements";
    const linkMarkup = data.linkUrl
      ? `
        <a class="link-card" href="${data.linkUrl}" target="_blank" rel="noreferrer">
          ${
            data.linkImage
              ? `<img class="link-thumb" src="${data.linkImage}" alt="" loading="lazy" />`
              : ""
          }
          <span class="link-title" data-editable="true" data-field="linkTitle">${data.linkTitle || data.linkUrl}</span>
          <span class="link-url" data-editable="true" data-field="linkUrl">${data.linkUrl}</span>
        </a>
      `
      : "";
    card.innerHTML = `
      <h3 data-editable="true" data-field="title">${data.title || ""}</h3>
      <p data-editable="true" data-field="body">${data.body || ""}</p>
      ${linkMarkup}
      <div class="meta">${meta}</div>
      <button class="delete-button" type="button" data-action="delete" data-doc-id="${doc.id}" data-item-type="announcements">
        Delete
      </button>
    `;
    container.appendChild(card);
  });
  setEmptyState("announcements", docs.length > 0);
  applyEditableState(document.body.classList.contains("edit-mode"));
};

const renderMessages = (docs) => {
  const container = document.querySelector('[data-container="messages"]');
  if (!container) {
    return;
  }
  container.innerHTML = "";
  docs.forEach((doc) => {
    const data = doc.data();
    const meta = data.authorName
      ? `${data.authorName} · ${formatDate(data.createdAt)}`
      : formatDate(data.createdAt);
    const message = document.createElement("div");
    message.className = "message";
    message.dataset.docId = doc.id;
    message.dataset.itemType = "messages";
    const linkMarkup = data.linkUrl
      ? `
        <a class="link-card" href="${data.linkUrl}" target="_blank" rel="noreferrer">
          ${
            data.linkImage
              ? `<img class="link-thumb" src="${data.linkImage}" alt="" loading="lazy" />`
              : ""
          }
          <span class="link-title" data-editable="true" data-field="linkTitle">${data.linkTitle || data.linkUrl}</span>
          <span class="link-url" data-editable="true" data-field="linkUrl">${data.linkUrl}</span>
        </a>
      `
      : "";
    message.innerHTML = `
      <h4 data-editable="true" data-field="title">${data.title || ""}</h4>
      <p data-editable="true" data-field="body">${data.body || ""}</p>
      ${linkMarkup}
      <span class="meta">${meta}</span>
      <button class="delete-button" type="button" data-action="delete" data-doc-id="${doc.id}" data-item-type="messages">
        Delete
      </button>
    `;
    container.appendChild(message);
  });
  setEmptyState("messages", docs.length > 0);
  applyEditableState(document.body.classList.contains("edit-mode"));
};

const renderEvents = (docs) => {
  const container = document.querySelector('[data-container="events"]');
  if (!container) {
    return;
  }
  container.innerHTML = "";
  docs.forEach((doc) => {
    const data = doc.data();
    const eventItem = document.createElement("div");
    eventItem.className = "timeline-item";
    eventItem.dataset.docId = doc.id;
    eventItem.dataset.itemType = "events";
    const linkMarkup = data.linkUrl
      ? `
        <a class="link-card" href="${data.linkUrl}" target="_blank" rel="noreferrer">
          ${
            data.linkImage
              ? `<img class="link-thumb" src="${data.linkImage}" alt="" loading="lazy" />`
              : ""
          }
          <span class="link-title" data-editable="true" data-field="linkTitle">${data.linkTitle || data.linkUrl}</span>
          <span class="link-url" data-editable="true" data-field="linkUrl">${data.linkUrl}</span>
        </a>
      `
      : "";
    eventItem.innerHTML = `
      <h4 data-editable="true" data-field="title">${data.title || ""}</h4>
      <p data-editable="true" data-field="body">${data.body || ""}</p>
      ${linkMarkup}
      <button class="delete-button" type="button" data-action="delete" data-doc-id="${doc.id}" data-item-type="events">
        Delete
      </button>
    `;
    container.appendChild(eventItem);
  });
  setEmptyState("events", docs.length > 0);
  applyEditableState(document.body.classList.contains("edit-mode"));
};

const renderList = (key, docs) => {
  const list = document.querySelector(`[data-list-id="${key}"]`);
  if (!list) {
    return;
  }
  list.innerHTML = "";
  docs.forEach((doc) => {
    const data = doc.data();
    const linkMarkup = data.linkUrl
      ? `
        <a class="link-card small" href="${data.linkUrl}" target="_blank" rel="noreferrer">
          ${
            data.linkImage
              ? `<img class="link-thumb" src="${data.linkImage}" alt="" loading="lazy" />`
              : ""
          }
          <span class="link-title" data-editable="true" data-field="linkTitle">${data.linkTitle || data.linkUrl}</span>
          <span class="link-url" data-editable="true" data-field="linkUrl">${data.linkUrl}</span>
        </a>
      `
      : "";
    const li = document.createElement("li");
    li.dataset.docId = doc.id;
    li.dataset.itemType = key;
    li.innerHTML = `
      <span data-editable="true" data-field="text">${data.text || ""}</span>
      ${linkMarkup}
      <button class="delete-button small" type="button" data-action="delete" data-doc-id="${doc.id}" data-item-type="${key}">
        Delete
      </button>
    `;
    list.appendChild(li);
  });
  setEmptyState(key, docs.length > 0);
  applyEditableState(document.body.classList.contains("edit-mode"));
};

const startListeners = () => {
  if (!db) {
    return;
  }
  stopListeners();

  listeners = [
    db
      .collection(collections.announcements)
      .orderBy("createdAt", "desc")
      .onSnapshot((snapshot) => renderAnnouncements(snapshot.docs)),
    db
      .collection(collections.messages)
      .orderBy("createdAt", "desc")
      .onSnapshot((snapshot) => renderMessages(snapshot.docs)),
    db
      .collection(collections.events)
      .orderBy("createdAt", "asc")
      .onSnapshot((snapshot) => renderEvents(snapshot.docs)),
    db
      .collection(collections.shows)
      .orderBy("createdAt", "asc")
      .onSnapshot((snapshot) => renderList("shows", snapshot.docs)),
    db
      .collection(collections.auditions)
      .orderBy("createdAt", "asc")
      .onSnapshot((snapshot) => renderList("auditions", snapshot.docs)),
  ];
};

const stopListeners = () => {
  listeners.forEach((unsubscribe) => unsubscribe());
  listeners = [];
};

const toggleEditMode = (enabled) => {
  if (!isEditor) {
    return;
  }
  applyEditableState(enabled);
  if (enabled) {
    stopListeners();
  } else {
    startListeners();
  }
};

const wireDeleteActions = () => {
  if (deleteHandlerWired) {
    return;
  }
  deleteHandlerWired = true;
  document.addEventListener("click", async (event) => {
    const button = event.target.closest('[data-action="delete"]');
    if (!button) {
      return;
    }
    if (!isEditor || !db) {
      showToast("Only editors can delete.");
      return;
    }
    const docId = button.dataset.docId;
    const type = button.dataset.itemType;
    if (!docId || !type) {
      return;
    }
    const confirmed = window.confirm("Delete this item?");
    if (!confirmed) {
      return;
    }
    try {
      await db.collection(type).doc(docId).delete();
      showToast("Deleted.");
    } catch (error) {
      showToast("Delete failed.");
      console.error(error);
    }
  });
};

const wirePostForm = () => {
  if (!postForm || !postType) {
    return;
  }
  updatePostFields();
  postType.addEventListener("change", updatePostFields);

  postForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!db || !currentUser) {
      showToast("Please sign in to post.");
      return;
    }

    const type = postType.value;
    const authorName =
      postName?.value?.trim() ||
      currentUser.displayName ||
      currentUser.email ||
      "Member";
    const authorEmail = currentUser.email || null;
    const linkTitle = postLinkTitle?.value?.trim() || "";
    const linkUrl = normalizeUrl(postLinkUrl?.value?.trim() || "");
    const preview = linkUrl ? await fetchLinkPreview(linkUrl) : { title: "", image: "" };
    const resolvedLinkTitle = linkTitle || preview.title || "";
    const resolvedLinkImage = preview.image || "";

    if (type === "shows" || type === "auditions") {
      const text = postListItem?.value?.trim() || "";
      if (!text) {
        showToast("Please add an item.");
        return;
      }
      try {
        await db.collection(type).add({
          text,
          linkTitle: resolvedLinkTitle,
          linkUrl,
          linkImage: resolvedLinkImage,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          authorName,
          authorEmail,
        });
        if (postListItem) {
          postListItem.value = "";
        }
        if (postLinkTitle) {
          postLinkTitle.value = "";
        }
        if (postLinkUrl) {
          postLinkUrl.value = "";
        }
        showToast("Posted.");
      } catch (error) {
        showToast("Could not post.");
        console.error(error);
      }
      return;
    }

    const title = postTitle?.value?.trim() || "";
    const body = postBody?.value?.trim() || "";
    if (!title || !body) {
      showToast("Please add a title and details.");
      return;
    }

    try {
      await db.collection(type).add({
        title,
        body,
        linkTitle: resolvedLinkTitle,
        linkUrl,
        linkImage: resolvedLinkImage,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        authorName,
        authorEmail,
      });
      if (postTitle) {
        postTitle.value = "";
      }
      if (postBody) {
        postBody.value = "";
      }
      if (postLinkTitle) {
        postLinkTitle.value = "";
      }
      if (postLinkUrl) {
        postLinkUrl.value = "";
      }
      showToast("Posted.");
    } catch (error) {
      showToast("Could not post.");
      console.error(error);
    }
  });
};

const saveEdits = async () => {
  if (!db || !isEditor) {
    return;
  }

  const updates = [];

  document.querySelectorAll("[data-doc-id]").forEach((element) => {
    const docId = element.dataset.docId;
    const type = element.dataset.itemType;
    if (!docId || !type) {
      return;
    }

    if (type === "shows" || type === "auditions") {
      const textValue =
        element.querySelector('[data-field="text"]')?.textContent ||
        element.textContent ||
        "";
      const linkTitle =
        element.querySelector('[data-field="linkTitle"]')?.textContent || "";
      const linkUrlRaw =
        element.querySelector('[data-field="linkUrl"]')?.textContent || "";
      const linkUrl = normalizeUrl(linkUrlRaw.trim());
      updates.push(
        db.collection(type).doc(docId).update({
          text: textValue.trim(),
          linkTitle: linkTitle.trim(),
          linkUrl: linkUrl,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedBy: currentUser?.email || null,
        })
      );
      return;
    }

    const title = element.querySelector('[data-field="title"]')?.textContent || "";
    const body = element.querySelector('[data-field="body"]')?.textContent || "";
    const linkTitle =
      element.querySelector('[data-field="linkTitle"]')?.textContent || "";
    const linkUrlRaw =
      element.querySelector('[data-field="linkUrl"]')?.textContent || "";
    const linkUrl = normalizeUrl(linkUrlRaw.trim());
    updates.push(
      db.collection(type).doc(docId).update({
        title,
        body,
        linkTitle: linkTitle.trim(),
        linkUrl: linkUrl,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: currentUser?.email || null,
      })
    );
  });

  try {
    await Promise.all(updates);
    showToast("Saved for everyone.");
    toggleEditMode(false);
  } catch (error) {
    showToast("Save failed. Check your permissions.");
    console.error(error);
  }
};

const addItem = async (type) => {
  if (!db || !isEditor) {
    return;
  }

  if (type === "shows" || type === "auditions") {
    const text = prompt(`Add a new ${type === "shows" ? "show" : "audition"} item`);
    if (!text) {
      return;
    }
    const linkUrl = normalizeUrl(prompt("Optional link URL") || "");
    const linkTitle = linkUrl ? prompt("Optional link title") || "" : "";
      const preview = linkUrl ? await fetchLinkPreview(linkUrl) : { title: "", image: "" };
      const resolvedLinkTitle = linkTitle || preview.title || "";
      const resolvedLinkImage = preview.image || "";
    try {
      await db.collection(type).add({
        text,
          linkTitle: resolvedLinkTitle,
          linkUrl,
          linkImage: resolvedLinkImage,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        authorName: currentUser?.displayName || currentUser?.email || "Member",
        authorEmail: currentUser?.email || null,
      });
      showToast("Added.");
    } catch (error) {
      showToast("Could not add.");
      console.error(error);
    }
    return;
  }

  const title = prompt(`Title for the new ${type.slice(0, -1)}`);
  if (!title) {
    return;
  }
  const body = prompt("Details to share");
  if (!body) {
    return;
  }
  const linkUrl = normalizeUrl(prompt("Optional link URL") || "");
  const linkTitle = linkUrl ? prompt("Optional link title") || "" : "";
  const preview = linkUrl ? await fetchLinkPreview(linkUrl) : { title: "", image: "" };
  const resolvedLinkTitle = linkTitle || preview.title || "";
  const resolvedLinkImage = preview.image || "";

  try {
    await db.collection(type).add({
      title,
      body,
      linkTitle: resolvedLinkTitle,
      linkUrl,
      linkImage: resolvedLinkImage,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      authorName: currentUser?.displayName || currentUser?.email || "Member",
      authorEmail: currentUser?.email || null,
    });
    showToast("Added.");
  } catch (error) {
    showToast("Could not add.");
    console.error(error);
  }
};

const seedDemoContent = async () => {
  if (!db || !isEditor) {
    return;
  }
  try {
    const [announcementsSnap, messagesSnap, eventsSnap] = await Promise.all([
      db.collection("announcements").limit(1).get(),
      db.collection("messages").limit(1).get(),
      db.collection("events").limit(1).get(),
    ]);

    if (!announcementsSnap.empty || !messagesSnap.empty || !eventsSnap.empty) {
      showToast("Demo content already exists.");
      return;
    }

    await Promise.all([
      db.collection("announcements").add({
        title: "New show opening!",
        body: '"Midsummer in May" opens next weekend. Tickets are live.',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        authorName: "Alex",
          linkTitle: "Tickets and info",
          linkUrl: "https://example.com",
      }),
      db.collection("announcements").add({
        title: "Congrats, castmates",
        body: "Shoutout to everyone who booked winter gigs.",
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        authorName: "Kieran",
      }),
      db.collection("messages").add({
        title: "Looking for a reader?",
        body: "I need a scene partner this Thursday evening. Anyone up for it?",
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        authorName: "Riley",
          linkTitle: "RSVP",
          linkUrl: "https://example.com",
      }),
      db.collection("events").add({
        title: "Jan 24 · Opening night meet-up",
        body: "Pre-show dinner near the theater. RSVP in the form below.",
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          linkTitle: "Event info",
          linkUrl: "https://example.com",
      }),
      db.collection("shows").add({
        text: '"The Enchanted Forest" — Feb 2-18',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          linkTitle: "Tickets",
          linkUrl: "https://example.com",
      }),
      db.collection("auditions").add({
        text: "City Players — submissions due Jan 20",
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          linkTitle: "Audition packet",
          linkUrl: "https://example.com",
      }),
    ]);

    showToast("Demo content added.");
  } catch (error) {
    showToast("Could not seed content.");
    console.error(error);
  }
};

const wireEditorTools = () => {
  const toggleEditButton = document.getElementById("toggleEditMode");
  const saveEditsButton = document.getElementById("saveEdits");
  const cancelEditsButton = document.getElementById("cancelEdits");
  const seedDemoButton = document.getElementById("seedDemo");
  const inviteEditorButton = document.getElementById("inviteEditor");

  toggleEditButton?.addEventListener("click", () => {
    const enabled = !document.body.classList.contains("edit-mode");
    toggleEditMode(enabled);
    toggleEditButton.textContent = enabled ? "Disable edit mode" : "Enable edit mode";
  });

  saveEditsButton?.addEventListener("click", () => {
    saveEdits();
  });

  cancelEditsButton?.addEventListener("click", () => {
    toggleEditMode(false);
  });

  seedDemoButton?.addEventListener("click", () => {
    seedDemoContent();
  });

  inviteEditorButton?.addEventListener("click", async () => {
    if (!db || !isEditor) {
      return;
    }
    const email = prompt("Invite editor by email");
    if (!email) {
      return;
    }
    const normalized = email.trim().toLowerCase();
    try {
      await db.collection(collections.editorInvites).doc(normalized).set({
        email: normalized,
        invitedBy: currentUser?.email || null,
        invitedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      showToast("Invite added. They can sign in now.");
    } catch (error) {
      showToast("Could not add invite.");
      console.error(error);
    }
  });

  document.querySelectorAll("[data-add]").forEach((button) => {
    button.addEventListener("click", () => {
      const type = button.getAttribute("data-add");
      if (!type) {
        return;
      }
      addItem(type);
    });
  });
};

const initAuth = () => {
  if (!window.firebase) {
    console.warn("Firebase scripts did not load.");
    wireAuthUnavailable();
    return;
  }

  const configValues = Object.values(firebaseConfig);
  const hasPlaceholders = configValues.some((value) =>
    String(value).includes("YOUR_")
  );
  if (hasPlaceholders) {
    console.warn("Firebase config is not set.");
    setAuthVisibility(false);
    setRoleVisibility("viewer");
    wireAuthUnavailable();
    return;
  }

  try {
    firebase.initializeApp(firebaseConfig);
  } catch (error) {
    console.error(error);
    wireAuthUnavailable();
    return;
  }
  auth = firebase.auth();
  db = firebase.firestore();
  const googleProvider = new firebase.auth.GoogleAuthProvider();
  const facebookProvider = new firebase.auth.FacebookAuthProvider();

  authButtons.google.forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await auth.signInWithPopup(googleProvider);
      } catch (error) {
        showToast("Google sign-in failed.");
        console.error(error);
      }
    });
  });

  authButtons.facebook.forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await auth.signInWithPopup(facebookProvider);
      } catch (error) {
        showToast("Facebook sign-in failed.");
        console.error(error);
      }
    });
  });

  signOutBtn?.addEventListener("click", async () => {
    try {
      await auth.signOut();
    } catch (error) {
      showToast("Sign-out failed.");
      console.error(error);
    }
  });

  auth.onAuthStateChanged((user) => {
    currentUser = user;
    if (user) {
      const label = user.displayName || user.email || "Signed in";
      if (userBadge) {
        userBadge.textContent = label;
      }
      subscribeEditorStatus(user.email);
      setAuthVisibility(true);
      startListeners();
    } else {
      isEditor = false;
      if (userBadge) {
        userBadge.textContent = "Signed in";
      }
      if (editorInviteUnsubscribe) {
        editorInviteUnsubscribe();
        editorInviteUnsubscribe = null;
      }
      setRoleVisibility(null);
      setAuthVisibility(false);
      stopListeners();
      clearContainers();
    }
  });
};

toastTargets.forEach((button) => {
  button.addEventListener("click", () => {
    showToast("Thanks! Your update is ready to be sent.");
  });
});

wireEditorTools();
wireDeleteActions();
wirePostForm();
initAuth();

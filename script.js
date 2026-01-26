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
const userName = document.getElementById("userName");
const userAvatar = document.getElementById("userAvatar");
const userMenuToggle = document.getElementById("userMenuToggle");
const userMenu = document.getElementById("userMenu");
const userSettingsBtn = document.getElementById("userSettingsBtn");
const userMenuWrapper = document.querySelector(".user-menu");
const authSections = document.querySelectorAll("[data-auth]");
const emptyStates = document.querySelectorAll("[data-empty]");
const toggleUserEditMode = document.getElementById("toggleUserEditMode");
const postForm = document.getElementById("postForm");
const postType = document.getElementById("postType");
const postTitleField = document.getElementById("postTitleField");
const postBodyField = document.getElementById("postBodyField");
const postListField = document.getElementById("postListField");
const postTitle = document.getElementById("postTitle");
const postBody = document.getElementById("postBody");
const postListItem = document.getElementById("postListItem");
const postDateField = document.getElementById("postDateField");
const postDate = document.getElementById("postDate");
const postTimeField = document.getElementById("postTimeField");
const postTime = document.getElementById("postTime");
const postImageUrl = document.getElementById("postImageUrl");
const postLinkUrl = document.getElementById("postLinkUrl");
const postName = postForm?.querySelector('input[name="name"]');

const firebaseConfig = window.__FIREBASE_CONFIG__ || {};

const collections = {
  announcements: "announcements",
  events: "events",
  shows: "shows",
  auditions: "auditions",
  editorInvites: "editorInvites",
};

let db = null;
let auth = null;
let currentUser = null;
let isEditor = false;
let isSignedIn = false;
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

const setUserMenuOpen = (open) => {
  if (!userMenuWrapper) {
    return;
  }
  userMenuWrapper.classList.toggle("open", open);
};

const wireUserMenu = () => {
  if (!userMenuToggle) {
    return;
  }
  userMenuToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    setUserMenuOpen(!userMenuWrapper?.classList.contains("open"));
  });

  userSettingsBtn?.addEventListener("click", () => {
    showToast("Settings coming soon.");
    setUserMenuOpen(false);
  });

  document.addEventListener("click", (event) => {
    if (userMenuWrapper && !userMenuWrapper.contains(event.target)) {
      setUserMenuOpen(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setUserMenuOpen(false);
    }
  });
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

const formatEventDate = (dateString) => {
  if (!dateString) {
    return "";
  }
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return dateString;
  }
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
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

const safeHref = (url) => {
  if (!url) {
    return "";
  }
  if (/^(javascript|data):/i.test(url.trim())) {
    return "";
  }
  const normalized = normalizeUrl(url.trim());
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
  } catch (error) {
    return "";
  }
  return "";
};

const createTextEl = (tag, className, text, attrs = {}) => {
  const el = document.createElement(tag);
  if (className) {
    el.className = className;
  }
  el.textContent = text || "";
  Object.entries(attrs).forEach(([key, value]) => {
    el.setAttribute(key, value);
  });
  return el;
};

const buildLinkCard = (data, isSmall = false) => {
  const href = safeHref(data.linkUrl || "");
  if (!href) {
    return null;
  }
  const card = document.createElement("a");
  card.className = `link-card${isSmall ? " small" : ""}`;
  card.href = href;
  card.target = "_blank";
  card.rel = "noreferrer";

  if (data.linkImage) {
    const thumb = document.createElement("img");
    thumb.className = "link-thumb";
    thumb.src = buildProxyImageUrl(data.linkImage);
    thumb.alt = "";
    thumb.loading = "lazy";
    card.appendChild(thumb);
  }

  const titleText = data.linkTitle || href;
  card.appendChild(
    createTextEl("span", "link-title", titleText, {
      "data-editable": "true",
      "data-field": "linkTitle",
    })
  );
  card.appendChild(
    createTextEl("span", "link-url", href, {
      "data-editable": "true",
      "data-field": "linkUrl",
    })
  );
  return card;
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

const buildProxyImageUrl = (url) => {
  if (!url) {
    return "";
  }
  if (url.startsWith("/.netlify/functions/image-proxy")) {
    return url;
  }
  return `/.netlify/functions/image-proxy?url=${encodeURIComponent(url)}`;
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
  const requiresDate = type === "shows" || type === "auditions" || type === "events";
  if (postTitleField) {
    postTitleField.hidden = isListType;
  }
  if (postBodyField) {
    postBodyField.hidden = isListType;
  }
  if (postListField) {
    postListField.hidden = !isListType;
  }
  if (postDateField && postDate) {
    postDateField.hidden = !requiresDate;
    postDate.required = requiresDate;
  }
  if (postTimeField && postTime) {
    postTimeField.hidden = !requiresDate;
    postTime.required = requiresDate;
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
    const metaText = data.authorName
      ? `Posted by ${data.authorName} · ${formatDate(data.createdAt)}`
      : formatDate(data.createdAt);
    const card = document.createElement("article");
    const backgroundImage = data.imageUrl
      ? buildProxyImageUrl(data.imageUrl)
      : "";
    card.className = `card${backgroundImage ? " media-card" : ""}`;
    card.dataset.docId = doc.id;
    card.dataset.itemType = "announcements";
    card.dataset.authorEmail = data.authorEmail || "";

    if (backgroundImage) {
      const mediaImage = document.createElement("img");
      mediaImage.className = "media-image";
      mediaImage.src = backgroundImage;
      mediaImage.alt = "";
      mediaImage.loading = "lazy";
      card.appendChild(mediaImage);
    }

    const content = document.createElement("div");
    content.className = "media-content";
    content.appendChild(
      createTextEl("h3", "media-title", data.title, {
        "data-editable": "true",
        "data-field": "title",
      })
    );
    content.appendChild(
      createTextEl("p", "media-body", data.body, {
        "data-editable": "true",
        "data-field": "body",
      })
    );
    const linkCard = buildLinkCard(data);
    if (linkCard) {
      content.appendChild(linkCard);
    }
    content.appendChild(createTextEl("div", "meta", metaText));

    const deleteButton = document.createElement("button");
    deleteButton.className = "delete-button";
    deleteButton.type = "button";
    deleteButton.dataset.action = "delete";
    deleteButton.dataset.docId = doc.id;
    deleteButton.dataset.itemType = "announcements";
    deleteButton.dataset.authorEmail = data.authorEmail || "";
    deleteButton.textContent = "Delete";
    content.appendChild(deleteButton);

    card.appendChild(content);

    if (data.authorPhoto) {
      const avatar = document.createElement("img");
      avatar.className = "avatar";
      avatar.src = data.authorPhoto;
      avatar.alt = `${data.authorName || "Member"} avatar`;
      avatar.loading = "lazy";
      card.appendChild(avatar);
    }
    container.appendChild(card);
  });
  setEmptyState("announcements", docs.length > 0);
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
    const backgroundImage = data.imageUrl
      ? buildProxyImageUrl(data.imageUrl)
      : "";
    eventItem.className = `timeline-item${backgroundImage ? " media-card" : ""}`;
    eventItem.dataset.docId = doc.id;
    eventItem.dataset.itemType = "events";
    eventItem.dataset.authorEmail = data.authorEmail || "";

    if (backgroundImage) {
      const mediaImage = document.createElement("img");
      mediaImage.className = "media-image";
      mediaImage.src = backgroundImage;
      mediaImage.alt = "";
      mediaImage.loading = "lazy";
      eventItem.appendChild(mediaImage);
    }

    if (data.eventDate) {
      const badge = document.createElement("span");
      badge.className = "date-badge";
      badge.textContent = formatEventDate(data.eventDate);
      eventItem.appendChild(badge);
    }

    const content = document.createElement("div");
    content.className = "media-content";
    content.appendChild(
      createTextEl("h4", "media-title", data.title, {
        "data-editable": "true",
        "data-field": "title",
      })
    );
    content.appendChild(
      createTextEl("p", "media-body", data.body, {
        "data-editable": "true",
        "data-field": "body",
      })
    );
    const linkCard = buildLinkCard(data);
    if (linkCard) {
      content.appendChild(linkCard);
    }

    const deleteButton = document.createElement("button");
    deleteButton.className = "delete-button";
    deleteButton.type = "button";
    deleteButton.dataset.action = "delete";
    deleteButton.dataset.docId = doc.id;
    deleteButton.dataset.itemType = "events";
    deleteButton.dataset.authorEmail = data.authorEmail || "";
    deleteButton.textContent = "Delete";
    content.appendChild(deleteButton);

    eventItem.appendChild(content);

    if (data.authorPhoto) {
      const avatar = document.createElement("img");
      avatar.className = "avatar";
      avatar.src = data.authorPhoto;
      avatar.alt = `${data.authorName || "Member"} avatar`;
      avatar.loading = "lazy";
      eventItem.appendChild(avatar);
    }
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
    const backgroundImage = data.imageUrl
      ? buildProxyImageUrl(data.imageUrl)
      : "";
    const li = document.createElement("li");
    li.dataset.docId = doc.id;
    li.dataset.itemType = key;
    li.dataset.authorEmail = data.authorEmail || "";
    if (backgroundImage) {
      li.className = "list-card media-card";
    } else {
      li.className = "list-card";
    }
    if (backgroundImage) {
      const mediaImage = document.createElement("img");
      mediaImage.className = "media-image";
      mediaImage.src = backgroundImage;
      mediaImage.alt = "";
      mediaImage.loading = "lazy";
      li.appendChild(mediaImage);
    }
    if (data.eventDate) {
      const badge = document.createElement("span");
      badge.className = "date-badge";
      badge.textContent = formatEventDate(data.eventDate);
      li.appendChild(badge);
    }
    const content = document.createElement("div");
    content.className = "media-content";
    content.appendChild(
      createTextEl("span", "media-title", data.text, {
        "data-editable": "true",
        "data-field": "text",
      })
    );
    const linkCard = buildLinkCard(data, true);
    if (linkCard) {
      content.appendChild(linkCard);
    }
    const deleteButton = document.createElement("button");
    deleteButton.className = "delete-button small";
    deleteButton.type = "button";
    deleteButton.dataset.action = "delete";
    deleteButton.dataset.docId = doc.id;
    deleteButton.dataset.itemType = key;
    deleteButton.dataset.authorEmail = data.authorEmail || "";
    deleteButton.textContent = "Delete";
    content.appendChild(deleteButton);
    li.appendChild(content);
    if (data.authorPhoto) {
      const avatar = document.createElement("img");
      avatar.className = "avatar";
      avatar.src = data.authorPhoto;
      avatar.alt = `${data.authorName || "Member"} avatar`;
      avatar.loading = "lazy";
      li.appendChild(avatar);
    }
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
  if (!isSignedIn) {
    return;
  }
  applyEditableState(enabled);
  if (enabled) {
    stopListeners();
  } else {
    startListeners();
  }
};

const canEditElement = (element) => {
  if (isEditor) {
    return true;
  }
  const authorEmail = element?.dataset?.authorEmail || "";
  return !!currentUser?.email && authorEmail === currentUser.email;
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
    if (!db) {
      return;
    }
    if (!isEditor && button.dataset.authorEmail !== currentUser?.email) {
      showToast("You can only delete your own posts.");
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
    const authorPhoto = currentUser.photoURL || "";
    const linkUrl = normalizeUrl(postLinkUrl?.value?.trim() || "");
    const imageUrl = normalizeUrl(postImageUrl?.value?.trim() || "");
    const eventDate = postDate?.value?.trim() || "";
    const eventTime = postTime?.value?.trim() || "";
    const requiresDate = type === "shows" || type === "auditions" || type === "events";
    if (requiresDate && !eventDate) {
      showToast("Please add a date.");
      return;
    }
    if (requiresDate && !eventTime) {
      showToast("Please add a start time.");
      return;
    }
    const preview = linkUrl ? await fetchLinkPreview(linkUrl) : { title: "", image: "" };
    const resolvedLinkTitle = preview.title || "";
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
          imageUrl,
          eventDate,
          eventTime,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          authorName,
          authorEmail,
          authorPhoto,
        });
        if (postListItem) {
          postListItem.value = "";
        }
        if (postDate) {
          postDate.value = "";
        }
        if (postTime) {
          postTime.value = "";
        }
        if (postImageUrl) {
          postImageUrl.value = "";
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
        imageUrl,
        eventDate,
        eventTime,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        authorName,
        authorEmail,
        authorPhoto,
      });
      if (postTitle) {
        postTitle.value = "";
      }
      if (postBody) {
        postBody.value = "";
      }
      if (postDate) {
        postDate.value = "";
      }
      if (postTime) {
        postTime.value = "";
      }
      if (postImageUrl) {
        postImageUrl.value = "";
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
  if (!db || !isSignedIn) {
    return;
  }

  const updates = [];

  document
    .querySelectorAll('[data-doc-id]:not([data-action="delete"])')
    .forEach((element) => {
    const docId = element.dataset.docId;
    const type = element.dataset.itemType;
    if (!docId || !type) {
      return;
    }
      if (!canEditElement(element)) {
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

    const title =
      element.querySelector('[data-field="title"]')?.textContent || "";
    const body =
      element.querySelector('[data-field="body"]')?.textContent || "";
    const linkTitle =
      element.querySelector('[data-field="linkTitle"]')?.textContent || "";
    const linkUrlRaw =
      element.querySelector('[data-field="linkUrl"]')?.textContent || "";
    const linkUrl = normalizeUrl(linkUrlRaw.trim());
    updates.push(
      db.collection(type).doc(docId).update({
        title: title.trim(),
        body: body.trim(),
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
    const code = error?.code || "unknown";
    showToast(`Save failed (${code}).`);
    console.error("Save failed", error);
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
      const eventDate = prompt("Date (required, e.g. 2026-02-10)") || "";
      if (!eventDate) {
        showToast("Date is required.");
        return;
      }
      const eventTime = prompt("Start time (required, e.g. 19:30)") || "";
      if (!eventTime) {
        showToast("Start time is required.");
        return;
      }
    const linkUrl = normalizeUrl(prompt("Optional link URL") || "");
      const imageUrl = normalizeUrl(prompt("Optional image URL") || "");
      const preview = linkUrl ? await fetchLinkPreview(linkUrl) : { title: "", image: "" };
      const resolvedLinkTitle = preview.title || "";
      const resolvedLinkImage = preview.image || "";
    try {
      await db.collection(type).add({
        text,
          linkTitle: resolvedLinkTitle,
          linkUrl,
          linkImage: resolvedLinkImage,
          imageUrl,
          eventDate,
          eventTime,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        authorName: currentUser?.displayName || currentUser?.email || "Member",
        authorEmail: currentUser?.email || null,
          authorPhoto: currentUser?.photoURL || "",
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
  const eventDate = type === "events" ? prompt("Date (required, e.g. 2026-02-10)") || "" : "";
  if (type === "events" && !eventDate) {
    showToast("Date is required.");
    return;
  }
  const eventTime =
    type === "events" ? prompt("Start time (required, e.g. 19:30)") || "" : "";
  if (type === "events" && !eventTime) {
    showToast("Start time is required.");
    return;
  }
  const linkUrl = normalizeUrl(prompt("Optional link URL") || "");
  const imageUrl = normalizeUrl(prompt("Optional image URL") || "");
  const preview = linkUrl ? await fetchLinkPreview(linkUrl) : { title: "", image: "" };
  const resolvedLinkTitle = preview.title || "";
  const resolvedLinkImage = preview.image || "";

  try {
    await db.collection(type).add({
      title,
      body,
      linkTitle: resolvedLinkTitle,
      linkUrl,
      linkImage: resolvedLinkImage,
      imageUrl,
      eventDate,
      eventTime,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      authorName: currentUser?.displayName || currentUser?.email || "Member",
      authorEmail: currentUser?.email || null,
      authorPhoto: currentUser?.photoURL || "",
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
    const [announcementsSnap, eventsSnap] = await Promise.all([
      db.collection("announcements").limit(1).get(),
      db.collection("events").limit(1).get(),
    ]);

    if (!announcementsSnap.empty || !eventsSnap.empty) {
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
          imageUrl: "https://images.unsplash.com/photo-1507679799987-c73779587ccf",
          authorPhoto: "",
      }),
      db.collection("announcements").add({
        title: "Congrats, castmates",
        body: "Shoutout to everyone who booked winter gigs.",
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        authorName: "Kieran",
          imageUrl: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee",
          authorPhoto: "",
      }),
      db.collection("events").add({
        title: "Jan 24 · Opening night meet-up",
        body: "Pre-show dinner near the theater. RSVP in the form below.",
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          linkTitle: "Event info",
          linkUrl: "https://example.com",
          eventDate: "2026-01-24",
          imageUrl: "https://images.unsplash.com/photo-1501281668745-f7f57925c3b4",
          authorPhoto: "",
      }),
      db.collection("shows").add({
        text: '"The Enchanted Forest" — Feb 2-18',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          linkTitle: "Tickets",
          linkUrl: "https://example.com",
          eventDate: "2026-02-02",
          imageUrl: "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429",
          authorPhoto: "",
      }),
      db.collection("auditions").add({
        text: "City Players — submissions due Jan 20",
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          linkTitle: "Audition packet",
          linkUrl: "https://example.com",
          eventDate: "2026-01-20",
          imageUrl: "https://images.unsplash.com/photo-1469474968028-56623f02e42e",
          authorPhoto: "",
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
      isSignedIn = true;
      const label = user.displayName || user.email || "Signed in";
      if (userName) {
        userName.textContent = label;
      }
      if (userAvatar) {
        if (user.photoURL) {
          userAvatar.src = user.photoURL;
          userAvatar.alt = `${label} avatar`;
          userAvatar.style.display = "block";
        } else {
          userAvatar.removeAttribute("src");
          userAvatar.alt = "";
          userAvatar.style.display = "none";
        }
      }
      subscribeEditorStatus(user.email);
      setAuthVisibility(true);
      startListeners();
    } else {
      isEditor = false;
      isSignedIn = false;
      if (userName) {
        userName.textContent = "Signed out";
      }
      if (userAvatar) {
        userAvatar.removeAttribute("src");
        userAvatar.alt = "";
        userAvatar.style.display = "none";
      }
      setUserMenuOpen(false);
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
wireUserMenu();

  toggleUserEditMode?.addEventListener("click", () => {
    const enabled = !document.body.classList.contains("edit-mode");
    toggleEditMode(enabled);
    toggleUserEditMode.textContent = enabled ? "Stop editing" : "Edit my posts";
  });
initAuth();

const calendarGrid = document.getElementById("calendarGrid");
const calendarEmpty = document.getElementById("calendarEmpty");
const calendarMonths = document.getElementById("calendarMonths");
const authSections = document.querySelectorAll("[data-auth]");
const googleSignInCalendar = document.getElementById("googleSignInCalendar");
const facebookSignInCalendar = document.getElementById("facebookSignInCalendar");
const calendarMonthFilter = document.getElementById("calendarMonthFilter");
const calendarTypeFilter = document.getElementById("calendarTypeFilter");

const firebaseConfig = window.__FIREBASE_CONFIG__ || {};
let db = null;
let auth = null;
let listeners = [];
let currentItems = [];

const setAuthVisibility = (signedIn) => {
  authSections.forEach((section) => {
    const desiredState = section.getAttribute("data-auth");
    const isSignedIn = desiredState === "signed-in";
    section.style.display = signedIn === isSignedIn ? "" : "none";
  });
};

const clearCalendar = () => {
  if (calendarGrid) {
    calendarGrid.innerHTML = "";
  }
  if (calendarMonths) {
    calendarMonths.innerHTML = "";
  }
  if (calendarEmpty) {
    calendarEmpty.style.display = "";
  }
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

const formatEventTime = (timeString) => {
  if (!timeString) {
    return "";
  }
  const [hours, minutes] = timeString.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return timeString;
  }
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
};

const buildCard = (item) => {
  const card = document.createElement("article");
  card.className = "card";
  const timeText = item.eventTime ? ` · ${formatEventTime(item.eventTime)}` : "";

  const title = document.createElement("h3");
  title.textContent = `${formatEventDate(item.eventDate)}${timeText} · ${item.title}`;
  card.appendChild(title);

  if (item.body) {
    const body = document.createElement("p");
    body.textContent = item.body;
    card.appendChild(body);
  }

  if (item.linkUrl) {
    const link = document.createElement("a");
    link.className = "link-card";
    link.href = item.linkUrl;
    link.target = "_blank";
    link.rel = "noreferrer";
    const linkTitle = document.createElement("span");
    linkTitle.className = "link-title";
    linkTitle.textContent = item.linkTitle || item.linkUrl;
    const linkUrl = document.createElement("span");
    linkUrl.className = "link-url";
    linkUrl.textContent = item.linkUrl;
    link.appendChild(linkTitle);
    link.appendChild(linkUrl);
    card.appendChild(link);
  }

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = item.typeLabel;
  card.appendChild(meta);
  return card;
};

const renderCalendar = (items) => {
  if (!calendarGrid || !calendarMonths || !calendarEmpty) {
    return;
  }
  calendarGrid.innerHTML = "";
  calendarMonths.innerHTML = "";

  if (items.length === 0) {
    calendarEmpty.style.display = "";
    return;
  }
  calendarEmpty.style.display = "none";

  items.forEach((item) => {
    calendarGrid.appendChild(buildCard(item));
  });

  const grouped = items.reduce((acc, item) => {
    const date = new Date(`${item.eventDate}T00:00:00`);
    const key = Number.isNaN(date.getTime())
      ? "Upcoming"
      : date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(item);
    return acc;
  }, {});

  Object.entries(grouped).forEach(([monthLabel, monthItems]) => {
    const card = document.createElement("div");
    card.className = "card";
    const heading = document.createElement("h3");
    heading.textContent = monthLabel;
    card.appendChild(heading);
    const list = document.createElement("ul");
    list.className = "list";
    monthItems.forEach((item) => {
      const li = document.createElement("li");
      const time = item.eventTime ? ` · ${formatEventTime(item.eventTime)}` : "";
      li.textContent = `${formatEventDate(item.eventDate)}${time} · ${item.title}`;
      list.appendChild(li);
    });
    card.appendChild(list);
    calendarMonths.appendChild(card);
  });
};

const getMonthKey = (item) => {
  const date = new Date(`${item.eventDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return "Upcoming";
  }
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
};

const applyFilters = () => {
  const monthValue = calendarMonthFilter?.value || "all";
  const typeValue = calendarTypeFilter?.value || "all";
  const filtered = currentItems.filter((item) => {
    const matchesMonth =
      monthValue === "all" || getMonthKey(item) === monthValue;
    const matchesType = typeValue === "all" || item.typeLabel === typeValue;
    return matchesMonth && matchesType;
  });
  renderCalendar(filtered);
};

const updateMonthOptions = (items) => {
  if (!calendarMonthFilter) {
    return;
  }
  const months = Array.from(
    new Set(items.map((item) => getMonthKey(item)))
  );
  calendarMonthFilter.innerHTML = "";
  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "All";
  calendarMonthFilter.appendChild(allOption);
  months.forEach((month) => {
    const option = document.createElement("option");
    option.value = month;
    option.textContent = month;
    calendarMonthFilter.appendChild(option);
  });
};

const wireFilters = () => {
  calendarMonthFilter?.addEventListener("change", applyFilters);
  calendarTypeFilter?.addEventListener("change", applyFilters);
};

const stopListeners = () => {
  listeners.forEach((unsubscribe) => unsubscribe());
  listeners = [];
};

const startListeners = () => {
  if (!db) {
    return;
  }
  stopListeners();

  const items = [];
  const pushItems = (snapshot, typeLabel) => {
    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      if (!data.eventDate) {
        return;
      }
      items.push({
        id: doc.id,
        typeLabel,
        eventDate: data.eventDate,
        eventTime: data.eventTime || "",
        title: data.title || data.text || "Untitled",
        body: data.body || "",
        linkTitle: data.linkTitle || "",
        linkUrl: data.linkUrl || "",
      });
    });
  };

  const refresh = () => {
    const sorted = items
      .filter((item) => item.eventDate)
      .sort((a, b) => {
        const aKey = `${item.eventDate}T${item.eventTime || "00:00"}`;
        const bKey = `${item.eventDate}T${item.eventTime || "00:00"}`;
        return new Date(aKey) - new Date(bKey);
      });
    currentItems = sorted;
    updateMonthOptions(sorted);
    applyFilters();
  };

  const collections = [
    { name: "events", label: "Event" },
    { name: "shows", label: "Show" },
    { name: "auditions", label: "Audition" },
  ];

  collections.forEach(({ name, label }) => {
    const unsubscribe = db
      .collection(name)
      .orderBy("eventDate", "asc")
      .onSnapshot((snapshot) => {
        const nextItems = items.filter((item) => item.typeLabel !== label);
        items.length = 0;
        items.push(...nextItems);
        pushItems(snapshot, label);
        refresh();
      });
    listeners.push(unsubscribe);
  });
};

const initAuth = () => {
  if (!window.firebase) {
    return;
  }
  const configValues = Object.values(firebaseConfig);
  const hasPlaceholders = configValues.some((value) =>
    String(value).includes("YOUR_")
  );
  if (hasPlaceholders) {
    setAuthVisibility(false);
    return;
  }

  firebase.initializeApp(firebaseConfig);
  auth = firebase.auth();
  db = firebase.firestore();
  const googleProvider = new firebase.auth.GoogleAuthProvider();
  const facebookProvider = new firebase.auth.FacebookAuthProvider();

  googleSignInCalendar?.addEventListener("click", async () => {
    await auth.signInWithPopup(googleProvider);
  });
  facebookSignInCalendar?.addEventListener("click", async () => {
    await auth.signInWithPopup(facebookProvider);
  });

  auth.onAuthStateChanged((user) => {
    if (user) {
      setAuthVisibility(true);
      startListeners();
    } else {
      setAuthVisibility(false);
      stopListeners();
      clearCalendar();
    }
  });
};

wireFilters();
initAuth();

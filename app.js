// Snug - posts are saved online in Firebase Firestore,
// so everyone who opens the site sees the same posts.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, addDoc, deleteDoc, updateDoc,
  doc, onSnapshot, query, orderBy, increment
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCxHgat6Kkfvabu5eBn_77CqAPwctdrDL0",
  authDomain: "snug-81d87.firebaseapp.com",
  projectId: "snug-81d87",
  storageBucket: "snug-81d87.firebasestorage.app",
  messagingSenderId: "510769053998",
  appId: "1:510769053998:web:8b51d606f886adae4e3abf",
  measurementId: "G-H81WHRZ8CZ"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const postsRef = collection(db, "posts");

const TAGS = ["All", "Diary", "Food", "Travel", "Thoughts", "Art"];
const MOODS = ["😊", "🥰", "😴", "🤔", "😢"];

const LIKED_KEY = "snug-liked";
const NAME_KEY = "snug-name";
const ID_KEY = "snug-user-id";

// ---------- state ----------
let posts = [];
let liked = loadJSON(LIKED_KEY, []);
let activeTag = "All";
let pickedMood = MOODS[0];
let popId = null;

// A random id for this browser, so we know which posts are "mine"
let myId = localStorage.getItem(ID_KEY);
if (!myId) {
  myId = "user-" + Date.now() + "-" + Math.floor(Math.random() * 100000);
  localStorage.setItem(ID_KEY, myId);
}

// ---------- elements ----------
const feed = document.getElementById("feed");
const filters = document.getElementById("filters");
const dialog = document.getElementById("writeDialog");
const form = document.getElementById("writeForm");
const moodBox = document.getElementById("moods");
const toast = document.getElementById("toast");

// ---------- small helpers ----------
function loadJSON(key, fallback) {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch (err) {
    return fallback;
  }
}

function saveLiked() {
  localStorage.setItem(LIKED_KEY, JSON.stringify(liked));
}

// Stops people from sneaking HTML into their posts
function escapeHTML(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function timeAgo(time) {
  const minutes = Math.floor((Date.now() - time) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return minutes + " min ago";
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + (hours === 1 ? " hour ago" : " hours ago");
  const days = Math.floor(hours / 24);
  return days + (days === 1 ? " day ago" : " days ago");
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2200);
}

// ---------- listen to the database ----------
// This runs again every time anyone adds, likes or deletes a post
const newestFirst = query(postsRef, orderBy("time", "desc"));

onSnapshot(newestFirst, snapshot => {
  posts = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  renderFeed();
}, error => {
  console.error(error);
  feed.innerHTML = '<p class="empty">Could not load posts. Check your Firebase setup.</p>';
});

// ---------- drawing the page ----------
function renderFilters() {
  filters.innerHTML = "";
  TAGS.forEach(tag => {
    const chip = document.createElement("button");
    chip.className = "chip" + (tag === activeTag ? " active" : "");
    chip.textContent = tag;
    chip.addEventListener("click", () => {
      activeTag = tag;
      renderFilters();
      renderFeed();
    });
    filters.appendChild(chip);
  });
}

function renderFeed() {
  const visible = posts.filter(p => activeTag === "All" || p.tag === activeTag);

  if (visible.length === 0) {
    feed.innerHTML = '<p class="empty">Nothing here yet. Be the first to write a ' +
      escapeHTML(activeTag) + ' post!</p>';
    return;
  }

  feed.innerHTML = visible.map(buildCard).join("");

  // little bounce on the heart that was just clicked
  if (popId) {
    const button = document.querySelector(`.post[data-id="${popId}"] .like`);
    if (button) {
      button.classList.add("pop");
      setTimeout(() => button.classList.remove("pop"), 400);
    }
    popId = null;
  }
}

function buildCard(post) {
  const isLiked = liked.includes(post.id);
  const isLong = post.body.length > 140;
  const preview = isLong ? post.body.slice(0, 140) + "..." : post.body;
  const isMine = post.ownerId === myId;

  return `
    <article class="post" data-id="${post.id}" data-tag="${escapeHTML(post.tag)}">
      <div class="post-head">
        <div class="avatar">${escapeHTML(post.author.charAt(0).toUpperCase())}</div>
        <div>
          <div class="who">${escapeHTML(post.author)}</div>
          <div class="when">${timeAgo(post.time)}</div>
        </div>
        <span class="mood">${escapeHTML(post.mood)}</span>
      </div>
      <h3>${escapeHTML(post.title)}</h3>
      <p class="body-text">${escapeHTML(preview)}</p>
      ${isLong ? '<button class="more">Read more</button>' : ""}
      <div class="post-foot">
        <span class="tag">${escapeHTML(post.tag)}</span>
        ${isMine ? '<button class="delete" title="Delete this post">🗑️</button>' : ""}
        <button class="like ${isLiked ? "liked" : ""}">
          <span class="heart">${isLiked ? "♥" : "♡"}</span> ${post.likes}
        </button>
      </div>
    </article>
  `;
}

// ---------- clicks inside the feed ----------
feed.addEventListener("click", async event => {
  const card = event.target.closest(".post");
  if (!card) return;
  const id = card.dataset.id;
  const post = posts.find(p => p.id === id);
  if (!post) return;

  if (event.target.closest(".like")) {
    await toggleLike(post);
  } else if (event.target.closest(".delete")) {
    if (confirm("Delete this post?")) {
      await deleteDoc(doc(db, "posts", id));
      showToast("Post deleted");
    }
  } else if (event.target.closest(".more")) {
    const button = event.target.closest(".more");
    const text = card.querySelector(".body-text");
    const expanded = button.textContent === "Show less";
    text.textContent = expanded ? post.body.slice(0, 140) + "..." : post.body;
    button.textContent = expanded ? "Read more" : "Show less";
  }
});

async function toggleLike(post) {
  const alreadyLiked = liked.includes(post.id);

  if (alreadyLiked) {
    liked = liked.filter(id => id !== post.id);
  } else {
    liked.push(post.id);
    popId = post.id;
  }
  saveLiked();

  // increment() is safe even if two friends like at the same moment
  await updateDoc(doc(db, "posts", post.id), {
    likes: increment(alreadyLiked ? -1 : 1)
  });
}

// ---------- write dialog ----------
function renderMoods() {
  moodBox.innerHTML = "";
  MOODS.forEach(mood => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mood-btn" + (mood === pickedMood ? " picked" : "");
    btn.textContent = mood;
    btn.addEventListener("click", () => {
      pickedMood = mood;
      renderMoods();
    });
    moodBox.appendChild(btn);
  });
}

document.getElementById("openWrite").addEventListener("click", () => {
  document.getElementById("authorInput").value = localStorage.getItem(NAME_KEY) || "";
  renderMoods();
  dialog.showModal();
});

document.getElementById("cancelWrite").addEventListener("click", () => dialog.close());

form.addEventListener("submit", async event => {
  event.preventDefault();

  const author = document.getElementById("authorInput").value.trim();
  const title = document.getElementById("titleInput").value.trim();
  const body = document.getElementById("bodyInput").value.trim();
  const tag = document.getElementById("tagInput").value;

  if (!author || !title || !body) return;

  localStorage.setItem(NAME_KEY, author);

  try {
    await addDoc(postsRef, {
      author: author,
      title: title,
      tag: tag,
      mood: pickedMood,
      body: body,
      likes: 0,
      time: Date.now(),
      ownerId: myId
    });
  } catch (err) {
    console.error(err);
    showToast("Could not publish. Try again.");
    return;
  }

  form.reset();
  dialog.close();
  activeTag = "All";
  renderFilters();
  showToast("Published!");
});

// ---------- start ----------
renderFilters();
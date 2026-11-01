// Runs the `js(el, p, api)` part of components in the browser.
//
// On the site's pages it starts by itself (it reads <script id="b-data">).
// The editor uses it directly, through `start(...)`, and stops it before every new
// render (`api.stop()`), so old listeners don't pile up.

// The only words the runtime says to visitors, in the page's language (<html lang>, from site.json).
const WORDS = {
  en: { offline: "We couldn't reach the server." },
  ro: { offline: "Nu am putut contacta serverul." },
};
const words = () => WORDS[typeof document !== "undefined" && document.documentElement?.lang === "ro" ? "ro" : "en"];

async function request(method, url, body) {
  const options = { method, credentials: "same-origin", headers: {} };
  if (body !== undefined) {
    options.headers["content-type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  try {
    const res = await fetch(url, options);
    let data = null;
    try {
      data = await res.json();
    } catch {
      // the answer isn't JSON
    }
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: words().offline } };
  }
}

// The `api` object every component receives.
export function createApi({ mode = "site", user } = {}) {
  const listeners = new Map();
  const cleanups = [];
  let userPromise = user !== undefined ? Promise.resolve(user) : null;

  const api = {
    mode,
    get: (url) => request("GET", url),
    async post(url, data = {}) {
      const result = await request("POST", url, data);
      // Log in, log out, new account: the next api.user() asks the server again.
      if (String(url).startsWith("/api/auth/")) userPromise = null;
      return result;
    },

    // The logged-in user, or null. On the site it comes from the page; otherwise it is asked from the
    // server once (and again after an api.post to /api/auth/...).
    user() {
      if (mode === "editor") return Promise.resolve(null);
      if (!userPromise) {
        userPromise = request("GET", "/api/auth/me").then((r) => (r.ok ? r.data?.user ?? null : null));
      }
      return userPromise;
    },

    // Messages between components, without them knowing about each other.
    on(name, fn) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(fn);
      return () => listeners.get(name)?.delete(fn);
    },
    emit(name, data) {
      for (const fn of [...(listeners.get(name) || [])]) {
        try {
          fn(data);
        } catch (err) {
          console.error(`[blocks] Error in the “${name}” event:`, err);
        }
      }
    },

    // Whatever you started on window/document (listeners, intervals), stop it here.
    //   api.onStop(() => clearInterval(timer));
    onStop(fn) {
      cleanups.push(fn);
    },

    // Used by the editor: stops everything the components started.
    stop() {
      for (const fn of cleanups.splice(0)) {
        try {
          fn();
        } catch (err) {
          console.error("[blocks] Error while stopping:", err);
        }
      }
      listeners.clear();
    },
  };
  return api;
}

// Starts the components that have JavaScript and returns the shared `api`.
//   instances: [{ id, type, props }]  (they come from render.js)
//   load(type): returns the component's module
// Components sit next to the core/ folder, so we find them relative to this file (it also works in a subfolder).
const loadComponent = (type) => import(new URL(`../components/${type}.js`, import.meta.url).href);

export async function start(instances, { mode = "site", user, root = document, load = loadComponent, api } = {}) {
  const shared = api || createApi({ mode, user });
  const types = [...new Set(instances.map((i) => i.type))];
  const modules = new Map(
    await Promise.all(
      types.map(async (type) => {
        try {
          return [type, (await load(type)).default];
        } catch (err) {
          console.error(`[blocks] Couldn't load the “${type}” component:`, err);
          return [type, null];
        }
      }),
    ),
  );

  for (const inst of instances) {
    const component = modules.get(inst.type);
    const el = root.querySelector(`[data-id="${CSS.escape(inst.id)}"]`);
    if (!component || typeof component.js !== "function" || !el) continue;
    try {
      const result = component.js(el, inst.props, shared);
      if (result && typeof result.catch === "function") {
        result.catch((err) => console.error(`[blocks] Error in “${inst.type}”:`, err));
      }
    } catch (err) {
      console.error(`[blocks] Error in “${inst.type}”:`, err);
    }
  }
  return shared;
}

const dataEl = typeof document !== "undefined" ? document.getElementById("b-data") : null;
if (dataEl) {
  try {
    const data = JSON.parse(dataEl.textContent);
    start(data.instances || [], { mode: data.mode, user: data.user });
    // A page brought back from the browser's memory by the "Back" button: if someone logged out (or in)
    // in the meantime, we ask for it again, so the data of whoever was logged in doesn't stay on screen.
    if (data.mode === "site") {
      addEventListener("pageshow", async (event) => {
        if (!event.persisted) return;
        const r = await request("GET", "/api/auth/me");
        if (r.ok && (r.data?.user?.id ?? null) !== (data.user?.id ?? null)) location.reload();
      });
    }
  } catch (err) {
    console.error("[blocks] The page data is invalid:", err);
  }
}

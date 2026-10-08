import { useEffect, useState } from "react";

// Avatars are stored per user in localStorage as a compressed base64 image.
// Each account gets its own key (flow-user-avatar:<email>) so Owner and Managers never share a photo.
// A custom DOM event keeps the header and sidebar avatar in sync without a context.
const AVATAR_KEY = "flow-user-avatar"; // legacy single-user key (pre per-user isolation)
const AVATAR_EVENT = "flow-avatar-changed";

function keyFor(userKey) {
  const id = String(userKey || "").trim().toLowerCase();
  return id ? AVATAR_KEY + ":" + id : null;
}

/**
 * Read the avatar for one user. The old shared key held the Owner's photo, so it is
 * only handed over (and migrated) when `claimLegacy` is true (Owner/Admin).
 */
export function getStoredAvatar(userKey, claimLegacy = false) {
  const key = keyFor(userKey);
  if (!key) return null;
  try {
    const own = localStorage.getItem(key);
    if (own) return own;
    if (claimLegacy) {
      const legacy = localStorage.getItem(AVATAR_KEY);
      if (legacy) {
        localStorage.setItem(key, legacy);
        localStorage.removeItem(AVATAR_KEY);
        return legacy;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function setStoredAvatar(userKey, dataUrl) {
  const key = keyFor(userKey);
  if (!key) return;
  try {
    if (dataUrl) localStorage.setItem(key, dataUrl);
    else localStorage.removeItem(key);
    // Removing must also clear the legacy shared photo so it can't resurface for the Owner.
    if (!dataUrl) localStorage.removeItem(AVATAR_KEY);
    window.dispatchEvent(new Event(AVATAR_EVENT));
  } catch {
    /* storage full */
  }
}

/**
 * Convert an uploaded image file (JPEG, PNG, WebP) to high-definition dataURL.
 * Supports window.devicePixelRatio >= 2 scaling and high-quality canvas smoothing
 * so avatars remain ultra-sharp on Retina / High-DPI displays.
 */
export function fileToAvatar(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        // High-DPI physical pixel scaling (minimum 2x factor)
        const dpr = typeof window !== 'undefined' ? Math.max(2, window.devicePixelRatio || 2) : 2;
        const TARGET_MAX = Math.min(512, Math.max(256, 128 * dpr));
        const scale = Math.min(TARGET_MAX / img.width, TARGET_MAX / img.height, 1);
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(img, 0, 0, w, h);
        }
        // Support format consistency: preserve PNG/WebP or export ultra-sharp JPEG (0.95 quality)
        const format = file.type === "image/png" ? "image/png" : file.type === "image/webp" ? "image/webp" : "image/jpeg";
        resolve(canvas.toDataURL(format, 0.95));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

/** React hook: returns the avatar URL of the given user and re-renders when it (or the user) changes. */
export function useAvatarUrl(userKey, claimLegacy = false) {
  const [url, setUrl] = useState(() => getStoredAvatar(userKey, claimLegacy));
  useEffect(() => {
    const sync = () => setUrl(getStoredAvatar(userKey, claimLegacy));
    sync(); // re-read immediately when the logged-in user changes
    window.addEventListener(AVATAR_EVENT, sync);
    return () => window.removeEventListener(AVATAR_EVENT, sync);
  }, [userKey, claimLegacy]);
  return url;
}

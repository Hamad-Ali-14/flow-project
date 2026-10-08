import { useEffect, useState } from "react";

// Avatar stored in localStorage as a compressed base64 JPEG.
// A custom DOM event keeps the header and sidebar avatar in sync without a context.
const AVATAR_KEY = "flow-user-avatar";
const AVATAR_EVENT = "flow-avatar-changed";

export function getStoredAvatar() {
  try {
    return localStorage.getItem(AVATAR_KEY) || null;
  } catch {
    return null;
  }
}

export function setStoredAvatar(dataUrl) {
  try {
    if (dataUrl) localStorage.setItem(AVATAR_KEY, dataUrl);
    else localStorage.removeItem(AVATAR_KEY);
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

/** React hook: returns current avatar URL and re-renders when it changes. */
export function useAvatarUrl() {
  const [url, setUrl] = useState(() => getStoredAvatar());
  useEffect(() => {
    const handler = () => setUrl(getStoredAvatar());
    window.addEventListener(AVATAR_EVENT, handler);
    return () => window.removeEventListener(AVATAR_EVENT, handler);
  }, []);
  return url;
}



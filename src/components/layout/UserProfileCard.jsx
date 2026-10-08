import React, { useEffect, useRef, useState } from "react";
import { ChevronUp, LogOut, Camera } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useTanks } from "../../hooks/useTanks";
import { useAvatarUrl, setStoredAvatar, fileToAvatar } from "../../hooks/useAvatar";
import { useLanguage } from "../../context/LanguageContext";

export function getInitials(name) {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length || name === "there") return "?";
  return (
    words[0][0] + (words.length > 1 ? words[words.length - 1][0] : "")
  ).toUpperCase();
}

// Bottom-of-sidebar account card with avatar, name, role/email, sign-out.
// The avatar is clickable to upload a photo from file or camera.
export default function UserProfileCard({ onAction, isManager: isManagerProp }) {
  const { session, signOut } = useAuth();
  const { userName, overview } = useTanks();
  const avatarUrl = useAvatarUrl();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const rootRef = useRef(null);
  const fileRef = useRef(null);

  const roleKey = overview?.viewer?.role;
  const isManager = isManagerProp !== undefined
    ? isManagerProp
    : (roleKey === 'manager' || (Boolean(roleKey) && roleKey !== 'owner' && roleKey !== 'admin'));
  const roleLabel = roleKey ? t("role_" + roleKey, roleKey) : "";
  const email = session?.email || "";
  const initials = getInitials(userName);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleSignOut = async () => {
    setLeaving(true);
    setOpen(false);
    onAction?.();
    await signOut();
  };

  const handleAvatarClick = (e) => {
    if (isManager) return;
    e.stopPropagation();
    fileRef.current?.click();
  };

  const handleFileChange = async (e) => {
    if (isManager) return;
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const dataUrl = await fileToAvatar(file);
      setStoredAvatar(dataUrl);
    } catch {
      /* ignore */
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="user-card" ref={rootRef}>
      {/* Hidden file input — accept images + allow camera on mobile (Owner/Admin only) */}
      {!isManager && (
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="user"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
      )}

      {open && (
        <div className="user-menu" role="menu">
          <div className="user-menu-head">
            <strong>{userName}</strong>
            {email && <span>{email}</span>}
            {roleLabel && <em>{roleLabel}</em>}
          </div>
          {!isManager && (
            <button
              className="user-menu-item"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                fileRef.current?.click();
              }}
            >
              <Camera size={14} /> {t("change_photo", "Change photo")}
            </button>
          )}
          {!isManager && avatarUrl && (
            <button
              className="user-menu-item"
              role="menuitem"
              onClick={() => {
                setStoredAvatar(null);
                setOpen(false);
              }}
            >
              {t("remove_photo", "Remove photo")}
            </button>
          )}
          <button
            className="user-menu-signout"
            role="menuitem"
            onClick={handleSignOut}
            disabled={leaving}
          >
            <LogOut size={16} /> {t("sign_out", "Sign out")}
          </button>
        </div>
      )}

      <button
        className={"user-card-btn" + (open ? " open" : "")}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={email || userName}
      >
        {/* Avatar: shows photo if available, otherwise initials */}
        <span
          className={"user-avatar" + (!isManager ? " avatar-upload" : "") + (!isManager && uploading ? " uploading" : "")}
          aria-hidden="true"
          onClick={!isManager ? handleAvatarClick : undefined}
          title={!isManager ? "Click to change photo" : undefined}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="avatar-img" />
          ) : (
            initials
          )}
          {!isManager && (
            <span className="avatar-camera-overlay">
              <Camera size={12} />
            </span>
          )}
        </span>
        <span className="user-meta">
          <strong>{userName}</strong>
          <small>{roleLabel || email || t("signed_in", "Signed in")}</small>
        </span>
        <ChevronUp size={16} className="user-chevron" />
      </button>
    </div>
  );
}
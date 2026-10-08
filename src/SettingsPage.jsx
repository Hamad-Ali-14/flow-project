import React from "react";
import { Settings, Sun, Moon, Monitor, Globe } from "lucide-react";
import { useLanguage, AVAILABLE_LANGUAGES } from "./context/LanguageContext";

export default function SettingsPage({ darkMode, setDarkMode }) {
  const { lang, setLang, t } = useLanguage();

  const themes = [
    { id: "light", label: t("light", "Light"), Icon: Sun },
    { id: "dark", label: t("dark", "Dark"), Icon: Moon },
    { id: "system", label: t("system", "System"), Icon: Monitor },
  ];

  const activeTheme = darkMode === null ? "system" : darkMode ? "dark" : "light";

  function applyTheme(id) {
    if (id === "system") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      setDarkMode(prefersDark);
      try {
        localStorage.setItem("flow-theme", "system");
      } catch {}
    } else {
      const isDark = id === "dark";
      setDarkMode(isDark);
      try {
        localStorage.setItem("flow-theme", isDark ? "dark" : "light");
      } catch {}
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <Settings size={15} /> {t("configuration", "CONFIGURATION")}
          </div>
          <h1>{t("settings_title", "Settings")}</h1>
          <p>{t("settings_desc", "Manage your app preferences and display options.")}</p>
        </div>
      </div>

      <div className="settings-grid">
        {/* Theme Card */}
        <div className="card settings-card">
          <div className="settings-card-head">
            <div className="settings-icon-wrap">
              {activeTheme === "dark" ? <Moon size={18} /> : <Sun size={18} />}
            </div>
            <div>
              <h2>{t("appearance", "Appearance")}</h2>
              <p>{t("appearance_desc", "Choose how FLOW OPS looks on your device.")}</p>
            </div>
          </div>
          <div className="theme-options">
            {themes.map(({ id, label, Icon }) => (
              <button
                key={id}
                className={"theme-option" + (activeTheme === id ? " active" : "")}
                onClick={() => applyTheme(id)}
              >
                <Icon size={20} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Language Card (English, Urdu only) */}
        <div className="card settings-card">
          <div className="settings-card-head">
            <div className="settings-icon-wrap">
              <Globe size={18} />
            </div>
            <div>
              <h2>{t("language", "Language")}</h2>
              <p>{t("language_desc", "Select your preferred display language.")}</p>
            </div>
          </div>

          <div className="lang-options-simple">
            {AVAILABLE_LANGUAGES.map(({ code, label }) => (
              <button
                key={code}
                type="button"
                className={"lang-row-btn" + (lang === code ? " active" : "")}
                onClick={() => setLang(code)}
              >
                <span className="lang-radio-circle">
                  {lang === code && <span className="lang-radio-dot" />}
                </span>
                <span className="lang-row-label">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
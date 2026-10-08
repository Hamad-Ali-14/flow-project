import React from "react";
import { ChevronDown, Settings, X } from "lucide-react";
import UserProfileCard from "./UserProfileCard";
import { useLanguage } from "../../context/LanguageContext";

// Left navigation. The account card (with Sign out) sits at the very bottom.
export default function Sidebar({ nav, page, onNavigate, open, onClose, isManager }) {
  const { t } = useLanguage();

  return (
    <aside className={"sidebar " + (open ? "show" : "")}>
      <div className="brand">
        <img src="assets/flow-logo.png" alt="" />
        <span>
          {t("brand_title", "FLOW")} <b>{t("brand_sub", "OPS")}</b>
        </span>
        <button
          className="closeMobile"
          onClick={onClose}
          aria-label="Close menu"
        >
          <X size={18} />
        </button>
      </div>

      <div className="sidebar-scroll">
        <div className="station-select">
          <span className="station-dot" />
          <div>
            <small>{t("active_station", "Active station")}</small>
            <strong>{t("station_name", "BROTHERS FUEL STATION")}</strong>
          </div>
          <ChevronDown size={16} />
        </div>

        <div className="nav-label">{t("main_menu", "MAIN MENU")}</div>
        <nav>
          {nav.map((n) => (
            <button
              key={n.id}
              className={page === n.id ? "active" : ""}
              onClick={() => onNavigate(n.id)}
            >
              <n.icon size={19} />
              <span>{n.label}</span>
              {n.badge && <i>{n.badge}</i>}
            </button>
          ))}
        </nav>

        <div className="nav-label utility">{t("management", "MANAGEMENT")}</div>
        <button
          className={"nav-button" + (page === "settings" ? " active" : "")}
          onClick={() => onNavigate("settings")}
        >
          <Settings size={19} />
          <span>{t("settings", "Settings")}</span>
        </button>
      </div>

      {/* Responsive bottom area containing only the User Profile Card */}
      <div className="sidebar-bottom">
        <UserProfileCard onAction={onClose} isManager={isManager} />
      </div>
    </aside>
  );
}

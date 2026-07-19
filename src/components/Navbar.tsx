import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Search, Home, Clapperboard, Tv, Settings, Users, Radio, Gamepad2 } from "lucide-react";
import { Logo } from "./Logo";
import { useAppStore } from "../store/useAppStore";
import { useDeviceProfile } from "../hooks/useDeviceProfile";

const BASE_TABS = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/series", label: "TV Series", icon: Tv, end: false },
  { to: "/movies", label: "Movies", icon: Clapperboard, end: false },
];

export function Navbar() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const iptvEnabled = useAppStore((s) => s.iptvEnabled);
  const isMobile = useDeviceProfile() === "mobile";

  // Live TV joins the centered tabs only when IPTV is enabled in Settings.
  const TABS = iptvEnabled
    ? [...BASE_TABS, { to: "/live", label: "Live TV", icon: Radio, end: false }]
    : BASE_TABS;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-40 transition-colors duration-300 ${
        scrolled ? "bg-bg/95 backdrop-blur" : "bg-gradient-to-b from-black/80 to-transparent"
      }`}
    >
      <nav className="mx-auto flex h-16 items-center px-4 sm:px-8">
        {/* Left: wordmark */}
        <div className="flex flex-1 items-center">
          <button onClick={() => navigate("/")} className="focusable rounded" aria-label="Home">
            <Logo />
          </button>
        </div>

        {/* Center: search + primary tabs */}
        <div className="flex items-center gap-1 sm:gap-2">
          <NavLink
            to="/search"
            className={({ isActive }) =>
              `focusable flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
                isActive ? "text-accent" : "text-white hover:text-accent"
              }`
            }
            aria-label="Search"
          >
            <Search size={22} />
          </NavLink>
          {TABS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `focusable flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold transition-colors sm:px-4 ${
                  isActive ? "bg-accent-soft text-accent" : "text-white/85 hover:text-white"
                }`
              }
            >
              <Icon size={17} className="sm:hidden" />
              <span className="hidden sm:inline">{label}</span>
              <span className="sm:hidden sr-only">{label}</span>
            </NavLink>
          ))}
        </div>

        {/* Right: remote (mobile) + settings + switch user */}
        <div className="flex flex-1 items-center justify-end gap-1">
          {isMobile && (
            <NavLink
              to="/remote"
              className={({ isActive }) =>
                `focusable flex h-10 w-10 items-center justify-center rounded-full ${isActive ? "text-accent" : "text-white/85 hover:text-white"}`
              }
              aria-label="Companion remote"
            >
              <Gamepad2 size={20} />
            </NavLink>
          )}
          <NavLink
            to="/settings"
            className="focusable flex h-10 w-10 items-center justify-center rounded-full text-white/85 hover:text-white"
            aria-label="Settings"
          >
            <Settings size={20} />
          </NavLink>
          <button
            onClick={() => navigate("/signin")}
            className="focusable flex h-10 w-10 items-center justify-center rounded-full text-white/85 hover:text-white"
            aria-label="Switch user"
          >
            <Users size={20} />
          </button>
        </div>
      </nav>
    </header>
  );
}

import { memo } from "react";
import AppImage from "@/features/covers/ui/AppImage";
import { Link, useLocation } from "react-router-dom";
import { sidebarNavItems } from "../data/navigation";
import logo from "@/assets/logo.svg";
import { useTranslation } from "@/languages";
import { useTheme } from "next-themes";
import { ACCENT_LOGOS, accentLogoThemeClass, usePlayerStore } from "@/features/player";
import { useModalStore } from "@/features/library";
import { useCustomizationStore, getBlockStyle } from "@/features/settings";
import { Tooltip } from "@/shared/ui";


interface SidebarProps {
  searchOpen: boolean;
  onSearchToggle: () => void;
  /** `bar` lays the items out as a phone bottom tab bar. */
  variant?: "rail" | "bar";
}

function Sidebar({ searchOpen, onSearchToggle, variant = "rail" }: SidebarProps) {
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const accentVariant = usePlayerStore((state) => state.accentVariant);
  const settingsOpen = useModalStore((state) => state.settingsOpen);
  const toggleSettings = useModalStore((state) => state.toggleSettings);

  const isRouteActive = (href: string) => {
    if (href === "/") {
      return pathname === "/" || pathname === "/home";
    }
    return pathname === href || pathname?.startsWith(`${href}/`);
  };
  const isItemActive = (id: string, href?: string) => {
    if (id === "search") {
      return searchOpen;
    }
    if (id === "settings") {
      return settingsOpen;
    }
    return href ? isRouteActive(href) : false;
  };

  const renderNavItems = () =>
    sidebarNavItems
      .filter((item) => item.id !== "settings")
      .map((item) => {
      const active = isItemActive(item.id, item.href);
      const Icon = item.Icon;
      const tooltipLabel = t(`common.sidebar.${item.id}`) || item.label;

      if (item.id === "search") {
        return (
          <Tooltip
            key={item.id}
            content={tooltipLabel}
            side="right"
            sideOffset={12}
          >
            <button
              type="button"
              aria-pressed={searchOpen}
              onClick={onSearchToggle}
              className={`group relative inline-flex items-center justify-center bg-transparent border-0 p-0 cursor-pointer active:scale-[0.96] transition-transform duration-100`}
            >
              <Icon
                size={26}
                className={`relative z-10 text-text-primary transition-opacity duration-150 ease-out ${
                  active ? "opacity-100" : "opacity-55 group-hover:opacity-90"
                }`}
              />
            </button>
          </Tooltip>
        );
      }

      return (
        <Tooltip
          key={item.id}
          content={tooltipLabel}
          side="right"
          sideOffset={12}
        >
          <Link
            key={item.id}
            to={item.href!}
            aria-current={active ? "page" : undefined}
            className={`group relative inline-flex items-center justify-center cursor-pointer active:scale-[0.96] transition-transform duration-100`}
          >
            <Icon
              size={26}
              className={`relative z-10 text-text-primary transition-opacity duration-150 ease-out ${
                active ? "opacity-100" : "opacity-55 group-hover:opacity-90"
              }`}
            />
          </Link>
        </Tooltip>
      );
      });

  const renderSettingsButton = () => {
    const settingsItem = sidebarNavItems.find((item) => item.id === "settings");
    if (!settingsItem) return null;
    const Icon = settingsItem.Icon;
    const tooltipLabel = t("common.sidebar.settings") || settingsItem.label;
    return (
      <Tooltip
        content={tooltipLabel}
        side="right"
        sideOffset={12}
      >
        <button
          type="button"
          aria-pressed={settingsOpen}
          onClick={toggleSettings}
          className={`group relative inline-flex items-center justify-center bg-transparent border-0 p-0 cursor-pointer active:scale-[0.96] transition-transform duration-100`}
        >
          <Icon
            size={26}
            className={`relative z-10 text-text-primary transition-opacity duration-150 ease-out ${
              settingsOpen ? "opacity-100" : "opacity-55 group-hover:opacity-90"
            }`}
          />
        </button>
      </Tooltip>
    );
  };

  const { resolvedTheme } = useTheme();
  const isDark =
    resolvedTheme
      ? resolvedTheme === "dark"
      : typeof document !== "undefined" &&
        (document.documentElement.getAttribute("data-theme") === "dark" ||
          (!document.documentElement.getAttribute("data-theme") &&
            window.matchMedia?.("(prefers-color-scheme: dark)")?.matches));
  const backgroundImage = useCustomizationStore((state) => state.backgroundImage);
  const sidebarConfig = useCustomizationStore((state) => state.sidebar);
  const hasCustomBg = Boolean(backgroundImage && isDark);
  const sidebarStyle = getBlockStyle(sidebarConfig, isDark, hasCustomBg);

  if (variant === "bar") {
    return (
      <nav
        className={`flex items-stretch justify-around rounded-xl ${hasCustomBg ? "" : "bg-bg-primary"}`}
        style={{ ...sidebarStyle, paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {sidebarNavItems.map((item) => {
          const active = isItemActive(item.id, item.href);
          const Icon = item.Icon;
          const label = t(`common.sidebar.${item.id}`) || item.label;
          const className = `flex flex-1 flex-col items-center justify-center gap-[3px] h-[56px] bg-transparent border-0 p-0 text-text-primary transition-opacity duration-150 ${
            active ? "opacity-100" : "opacity-55"
          }`;
          const content = (
            <>
              <Icon size={24} />
              <span className="text-[10.5px] font-medium leading-none">{label}</span>
            </>
          );
          if (item.href) {
            return (
              <Link key={item.id} to={item.href} aria-current={active ? "page" : undefined} className={className}>
                {content}
              </Link>
            );
          }
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={active}
              onClick={item.id === "search" ? onSearchToggle : toggleSettings}
              className={className}
            >
              {content}
            </button>
          );
        })}
      </nav>
    );
  }

  return (
    <aside className="h-full">
      <div
        className={`h-full w-[58px] rounded-l-xl rounded-r-sm ${
          hasCustomBg ? "" : "bg-bg-primary"
        } flex flex-col overflow-hidden`}
        style={sidebarStyle}
      >
        <div className="flex justify-center items-center pt-[16px] pb-[16px] shrink-0">

          <AppImage
            src={
              accentVariant === "default"
                ? logo
                : ACCENT_LOGOS[accentVariant]
            }
            alt="Logo"
            width={34}
            height={34}
            className={
              "w-[34px] h-[34px] " +
accentLogoThemeClass(accentVariant)
            }
            draggable={false}
          />
        </div>

        <nav className="relative flex-1 flex flex-col items-center gap-[24px] pt-[12px]">
          {renderNavItems()}
        </nav>

        <div className="pt-[16px] pb-[16px] shrink-0 flex justify-center items-center">
          {renderSettingsButton()}
        </div>
      </div>
    </aside>
  );
}

export default memo(Sidebar);

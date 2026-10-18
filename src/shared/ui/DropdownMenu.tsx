import {
  useLayoutEffect,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { useIsMobile } from "@/shared/hooks/useIsMobile";

export interface DropdownMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  onClick: () => void | Promise<void>;
  danger?: boolean;
  disabled?: boolean;
}

export interface DropdownMenuProps {
  trigger: React.ReactNode;
  items: DropdownMenuItem[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  position?: { x: number; y: number } | null;
  side?: "top" | "bottom";
  align?: "start" | "end";
  /** Heading of the bottom sheet the menu turns into on a phone. */
  title?: string;
  /** Replaces `title` in the bottom sheet, e.g. with the track the menu is for. */
  header?: React.ReactNode;
}

const SHEET_CLOSE_OFFSET = 80;
const SHEET_CLOSE_VELOCITY = 500;

function useFixedStyle(
  menuRef: RefObject<HTMLDivElement | null>,
  isFixed: boolean,
  position: { x: number; y: number } | null | undefined,
  open: boolean,
  side: "top" | "bottom" = "bottom",
  align: "start" | "end" = "start",
): React.CSSProperties {
  const [style, setStyle] = useState<React.CSSProperties>(() =>
    position ? { left: position.x, top: position.y } : {},
  );

  useLayoutEffect(() => {
    if (!isFixed || !position || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    let left = align === "end" ? position.x - rect.width : position.x;
    let top = side === "top" ? position.y - rect.height : position.y;

    if (left + rect.width > window.innerWidth) {
      left = window.innerWidth - rect.width - 8;
    }
    if (left < 8) left = 8;

    if (side !== "top" && top + rect.height > window.innerHeight) {
      top = position.y - rect.height - 8;
    }
    if (top < 8) top = 8;

    setStyle({ left, top });
  }, [isFixed, position, open, menuRef, side, align]);

  return style;
}

export default function DropdownMenu({
  trigger,
  items,
  open: controlledOpen,
  onOpenChange,
  position,
  side = "bottom",
  align = "start",
  title,
  header,
}: DropdownMenuProps) {
  const asSheet = useIsMobile();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const [computedPos, setComputedPos] = useState<{
    x: number;
    y: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (!position && open && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const x = align === "end" ? rect.right : rect.left;
      const y = side === "top" ? rect.top - 4 : rect.bottom + 4;
      setComputedPos({ x, y });
    }
  }, [open, position, side, align]);

  const targetPos = position || computedPos;
  const isFixed = !asSheet && Boolean(targetPos);
  const fixedStyle = useFixedStyle(menuRef, isFixed, targetPos, open, side, align);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (
        menuRef.current?.contains(e.target as Node) ||
        containerRef.current?.contains(e.target as Node)
      ) {
        return;
      }
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };

    // the sheet closes from its backdrop; the mouse events a phone emulates
    // after a long press would otherwise close it as soon as it opens
    if (!asSheet) document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, setOpen, asSheet]);

  const stopBubbling = (e: React.SyntheticEvent) => e.stopPropagation();

  const runItem = async (item: DropdownMenuItem) => {
    setOpen(false);
    await item.onClick();
  };

  // A phone gets a sheet from the bottom edge: a menu at the finger is small,
  // covered by the hand and easy to miss.
  const sheetContent = (
    <AnimatePresence>
      {open && (
        <div
          key="dropdown-sheet"
          className="fixed inset-0 z-[99999]"
          onClick={stopBubbling}
          onPointerDown={stopBubbling}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <motion.div
            className="absolute inset-0 touch-none bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => setOpen(false)}
          />
          <motion.div
            ref={menuRef}
            data-dropdown-menu="true"
            role="menu"
            className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-[16px] border-t border-border-primary/80 bg-bg-primary pb-[calc(env(safe-area-inset-bottom)+8px)]"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 34, stiffness: 380 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info: PanInfo) => {
              if (info.offset.y > SHEET_CLOSE_OFFSET || info.velocity.y > SHEET_CLOSE_VELOCITY) setOpen(false);
            }}
          >
            <div className="flex justify-center pt-[8px] pb-[4px]">
              <span className="h-[4px] w-[36px] rounded-full bg-border-alpha-33" />
            </div>
            {header ?? (title && (
              <p
                className="m-0 px-[20px] pt-[4px] pb-[8px] text-[13px] text-text-tertiary"
                style={{ fontFamily: "var(--font-inter), sans-serif" }}
              >
                {title}
              </p>
            ))}
            {header && <div className="mx-[20px] mb-[4px] h-px bg-border-alpha-14" />}
            <div className="flex flex-col px-[8px]">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={() => void runItem(item)}
                  className={`flex min-h-[52px] w-full items-center gap-[16px] rounded-[10px] border-none bg-transparent px-[12px] text-left text-[16px] select-none outline-none active:bg-border-alpha-14 disabled:pointer-events-none disabled:opacity-40 ${
                    item.danger ? "text-red-400" : "text-text-primary"
                  }`}
                  style={{ fontFamily: "var(--font-inter), sans-serif" }}
                >
                  {item.icon && (
                    <span
                      className={`flex w-[22px] shrink-0 items-center justify-center text-[20px] [&>svg]:h-[20px] [&>svg]:w-[20px] ${
                        item.danger ? "text-red-400" : "text-text-secondary"
                      }`}
                    >
                      {item.icon}
                    </span>
                  )}
                  <span className="flex-1 truncate">{item.label}</span>
                </button>
              ))}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  const menuContent = (
    <AnimatePresence>
      {open && (
        <motion.div
          key="dropdown-menu"
          ref={menuRef}
          data-dropdown-menu="true"
          initial={{ opacity: 0, scale: 0.96, y: side === "top" ? 2 : -2 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: side === "top" ? 2 : -2 }}
          transition={{ duration: 0.1, ease: "easeOut" }}
          className={`overflow-hidden rounded-md border border-border-primary/80 bg-bg-primary/95 backdrop-blur-md p-1 min-w-[160px] ${
            isFixed ? "fixed z-[99999]" : side === "top" ? "absolute right-0 bottom-full mb-1 z-50" : "absolute right-0 top-full mt-1 z-50"
          }`}
          style={isFixed ? fixedStyle : {}}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col gap-0.5">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={item.disabled}
                onClick={async (e) => {
                  e.stopPropagation();
                  setOpen(false);
                  await item.onClick();
                }}
                className={`group flex w-full items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-[13px] font-normal tracking-tight transition-colors border-none bg-transparent text-left cursor-pointer select-none outline-none ${
                  item.danger
                    ? "text-red-400 hover:bg-red-500/10 hover:text-red-400"
                    : "text-text-primary hover:bg-border-alpha-14"
                } disabled:pointer-events-none disabled:opacity-40`}
                style={{
                  fontFamily: "var(--font-inter), sans-serif",
                }}
              >
                {item.icon && (
                  <span
                    className={`shrink-0 flex items-center justify-center text-[15px] ${
                      item.danger
                        ? "text-red-400"
                        : "text-text-secondary group-hover:text-text-primary"
                    } transition-colors`}
                  >
                    {item.icon}
                  </span>
                )}
                <span className="truncate flex-1">{item.label}</span>
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div
      ref={containerRef}
      className="relative inline-flex"
      onClick={(e) => {
        if (!position) {
          e.stopPropagation();
          setOpen(!open);
        }
      }}
    >
      {trigger}
      {asSheet
        ? typeof document !== "undefined" && createPortal(sheetContent, document.body)
        : isFixed && typeof document !== "undefined"
          ? createPortal(menuContent, document.body)
          : menuContent}
    </div>
  );
}

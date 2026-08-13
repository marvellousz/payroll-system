"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";

interface DropdownOption<T extends string> {
  value: T;
  label: string;
}

interface DropdownProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: readonly DropdownOption<T>[];
  variant?: "form" | "header" | "compact";
  label?: string;
  placeholder?: string;
}

export default function Dropdown<T extends string>({
  value,
  onChange,
  options,
  variant = "form",
  label,
  placeholder = "Select…",
}: DropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerId = useId();
  const listId = useId();

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  function updateMenuPosition() {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = variant === "header" ? Math.max(rect.width, 180) : rect.width;
    // Keep menu on-screen horizontally
    const left = Math.min(rect.left, Math.max(8, window.innerWidth - width - 8));
    setMenuPos({
      top: rect.bottom + 4,
      left,
      width,
    });
  }

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    updateMenuPosition();
  }, [open, variant, options.length]);

  useEffect(() => {
    if (!open) return;

    function onReposition() {
      updateMenuPosition();
    }

    // Defer outside-close so the opening click cannot immediately close the menu
    const timer = window.setTimeout(() => {
      document.addEventListener("pointerdown", onPointerDown, true);
    }, 0);

    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);

    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open]);

  function openMenu(hint?: number) {
    if (options.length === 0) return;
    setHighlight(hint ?? (selectedIndex >= 0 ? selectedIndex : 0));
    setOpen(true);
  }

  function closeMenu() {
    setOpen(false);
    setHighlight(selectedIndex >= 0 ? selectedIndex : 0);
  }

  function toggleMenu() {
    if (open) closeMenu();
    else openMenu();
  }

  function handleTriggerKey(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        openMenu(e.key === "ArrowUp" ? options.length - 1 : undefined);
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlight((h) => {
          const next = Math.min(h + 1, options.length - 1);
          queueMicrotask(() => {
            menuRef.current
              ?.querySelectorAll<HTMLElement>("[role='option']")
              [next]?.scrollIntoView({ block: "nearest" });
          });
          return next;
        });
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlight((h) => {
          const next = Math.max(h - 1, 0);
          queueMicrotask(() => {
            menuRef.current
              ?.querySelectorAll<HTMLElement>("[role='option']")
              [next]?.scrollIntoView({ block: "nearest" });
          });
          return next;
        });
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (options[highlight]) {
          onChange(options[highlight].value);
          closeMenu();
        }
        break;
      case "Escape":
        e.preventDefault();
        closeMenu();
        triggerRef.current?.focus();
        break;
      case "Tab":
        closeMenu();
        break;
    }
  }

  const menu =
    open &&
    menuPos &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        ref={menuRef}
        id={listId}
        role="listbox"
        className="dropdown__menu dropdown__menu--portal"
        aria-label={label}
        style={{
          top: menuPos.top,
          left: menuPos.left,
          width: menuPos.width,
        }}
      >
        {options.length === 0 ? (
          <div className="dropdown__empty">No options</div>
        ) : (
          options.map((o, i) => (
            <button
              key={o.value || `opt-${i}`}
              type="button"
              role="option"
              aria-selected={o.value === value}
              className={`dropdown__option ${o.value === value ? "selected" : ""} ${i === highlight ? "highlighted" : ""}`}
              onMouseEnter={() => setHighlight(i)}
              onPointerDown={(e) => {
                // Keep focus on trigger; select on pointerdown so the menu
                // never loses the gesture to an outside-close race.
                e.preventDefault();
                e.stopPropagation();
                onChange(o.value);
                closeMenu();
              }}
            >
              {o.label}
            </button>
          ))
        )}
      </div>,
      document.body
    );

  return (
    <div className={`dropdown dropdown--${variant}`} ref={rootRef}>
      {label && (
        <label className="form-label" htmlFor={triggerId}>
          {label}
        </label>
      )}
      <button
        ref={triggerRef}
        type="button"
        id={triggerId}
        className={`dropdown__trigger ${open ? "open" : ""}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          toggleMenu();
        }}
        onKeyDown={handleTriggerKey}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={options.length === 0}
      >
        <span className={`dropdown__value ${selected ? "" : "dropdown__value--placeholder"}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={18}
          strokeWidth={2.5}
          className={`dropdown__chevron${open ? " dropdown__chevron--open" : ""}`}
          aria-hidden="true"
        />
      </button>
      {menu}
    </div>
  );
}

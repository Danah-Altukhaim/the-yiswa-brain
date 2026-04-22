import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon.js";

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function firstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function formatDisplay(value: string): string {
  if (!value) return "";
  const d = new Date(value + "T00:00:00");
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const DROPDOWN_HEIGHT = 380;

export function DatePicker({
  value,
  onChange,
  timeValue,
  onTimeChange,
  className,
}: {
  value: string;
  onChange: (val: string) => void;
  timeValue?: string;
  onTimeChange?: (val: string) => void;
  className?: string;
}) {
  const hasTime = typeof timeValue === "string" && typeof onTimeChange === "function";
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const today = new Date();
  const parsed = value ? new Date(value + "T00:00:00") : null;
  const validParsed = parsed && !isNaN(parsed.getTime()) ? parsed : null;

  const [viewYear, setViewYear] = useState(validParsed?.getFullYear() ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(validParsed?.getMonth() ?? today.getMonth());

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openAbove = spaceBelow < DROPDOWN_HEIGHT && rect.top > DROPDOWN_HEIGHT;
    setPos({
      top: openAbove ? rect.top - DROPDOWN_HEIGHT - 6 : rect.bottom + 6,
      left: rect.left,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        dropdownRef.current?.contains(target)
      ) return;
      setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function handleScroll() { updatePosition(); }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (open && validParsed) {
      setViewYear(validParsed.getFullYear());
      setViewMonth(validParsed.getMonth());
    }
  }, [open, validParsed]);

  function prevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  }

  function selectDay(day: number) {
    const m = String(viewMonth + 1).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    onChange(`${viewYear}-${m}-${d}`);
    if (!hasTime) setOpen(false);
  }

  function selectToday() {
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    onChange(`${today.getFullYear()}-${m}-${d}`);
    if (!hasTime) setOpen(false);
  }

  const totalDays = daysInMonth(viewYear, viewMonth);
  const startDay = firstDayOfMonth(viewYear, viewMonth);
  const prevMonthDays = daysInMonth(viewYear, viewMonth === 0 ? 11 : viewMonth - 1);

  const isSelected = (day: number) =>
    validParsed &&
    validParsed.getFullYear() === viewYear &&
    validParsed.getMonth() === viewMonth &&
    validParsed.getDate() === day;

  const isToday = (day: number) =>
    today.getFullYear() === viewYear &&
    today.getMonth() === viewMonth &&
    today.getDate() === day;

  return (
    <div className={className ?? ""}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        className="input-apple flex items-center justify-between text-left cursor-pointer"
      >
        <span className={value ? "text-apple-text" : "text-apple-tertiary"}>
          {value
            ? hasTime && timeValue
              ? `${formatDisplay(value)}, ${timeValue}`
              : formatDisplay(value)
            : hasTime ? "Select date & time" : "Select date"}
        </span>
        <Icon name="calendar-check" size={15} className="text-apple-tertiary" />
      </button>

      {open && pos && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[9999] w-[280px] bg-white rounded-apple-lg border border-apple-separator animate-scale-in"
          style={{ top: pos.top, left: pos.left, boxShadow: "var(--shadow-lg)" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-apple-separator">
            <button
              type="button"
              onClick={prevMonth}
              className="p-1 rounded-lg hover:bg-black/[0.04] transition-colors"
              aria-label="Previous month"
            >
              <Icon name="chevron-left" size={14} className="text-apple-secondary" />
            </button>
            <span className="text-[13px] font-semibold text-apple-text">
              {MONTHS[viewMonth]} {viewYear}
            </span>
            <button
              type="button"
              onClick={nextMonth}
              className="p-1 rounded-lg hover:bg-black/[0.04] transition-colors"
              aria-label="Next month"
            >
              <Icon name="chevron-right" size={14} className="text-apple-secondary" />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 px-2 pt-2">
            {DAYS.map((d) => (
              <div key={d} className="text-center text-[11px] font-medium text-apple-tertiary py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 px-2 pb-2">
            {/* Previous month trailing days */}
            {Array.from({ length: startDay }, (_, i) => (
              <button
                key={`prev-${i}`}
                type="button"
                onClick={() => {
                  prevMonth();
                  selectDay(prevMonthDays - startDay + 1 + i);
                }}
                className="h-8 text-[12px] text-apple-tertiary/50 rounded-lg"
                tabIndex={-1}
              >
                {prevMonthDays - startDay + 1 + i}
              </button>
            ))}

            {/* Current month days */}
            {Array.from({ length: totalDays }, (_, i) => {
              const day = i + 1;
              const selected = isSelected(day);
              const todayMark = isToday(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => selectDay(day)}
                  className={`h-8 text-[12px] rounded-lg transition-all duration-150 ${
                    selected
                      ? "bg-pair text-white font-semibold"
                      : todayMark
                        ? "text-pair font-semibold hover:bg-pair-light"
                        : "text-apple-text hover:bg-black/[0.04]"
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {hasTime && (
            <div className="flex items-center gap-2 px-3.5 py-2.5 border-t border-apple-separator">
              <Icon name="clock" size={14} className="text-apple-tertiary shrink-0" />
              <span className="text-[12px] font-medium text-apple-secondary">Time</span>
              <input
                type="time"
                value={timeValue}
                disabled={!value}
                onChange={(e) => onTimeChange?.(e.target.value)}
                className="input-apple ml-auto !py-1 !px-2 !text-[12px] w-[104px] shrink-0 cursor-pointer tabular-nums disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Time"
              />
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between px-3.5 py-2 border-t border-apple-separator">
            <button
              type="button"
              onClick={() => {
                onChange("");
                if (hasTime) onTimeChange?.("");
                setOpen(false);
              }}
              className="text-[12px] font-medium text-apple-secondary hover:text-apple-red transition-colors"
            >
              Clear
            </button>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={selectToday}
                className="text-[12px] font-medium text-apple-secondary hover:text-apple-text transition-colors"
              >
                Today
              </button>
              {hasTime && (
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-[12px] font-semibold text-pair hover:text-pair-hover transition-colors"
                >
                  Done
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

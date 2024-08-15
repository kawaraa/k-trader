"use client";
import { useEffect, useState } from "react";

export function Modal({ title, open, loading, onCancel, children }) {
  const cls = open ? "!h-full p-4 opacity-100" : "";

  return (
    <>
      <div
        className={`z-9 fixed inset-0 h-0 p-0 bg-blur opacity-0 transition-opacity duration-200 ${cls}`}
        onClick={onCancel}
      ></div>

      {/* min-h-[50%]  */}
      <Transition
        Tag="div"
        base={`no-select z-9 fixed left-5 bottom-10 md:bottom-1/2 md:translate-y-1/2 right-5 p-4 pt-10 overflow-hidden md:min-w-[550px] md:max-w-xl mx-auto default-bg rounded-lg`}
        enter="opacity-100 md:scale-100"
        exit="opacity-0 translate-y-4 md:scale-75"
        time="300"
        open={open}
        aria-label={"Add update bot form"}
        role="dialog"
        aria-modal="true"
      >
        <button
          onClick={onCancel}
          disabled={!!loading}
          className="w-6 h-6 absolute top-3 right-3 hover:text-red"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 100 100"
            className="pointer-events-none w-full"
            fill="none"
            strokeWidth="1"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path d="m10.88,89.06l78.5,-77.94m-78.5,0l78.5,77.94" strokeLinecap="round" strokeWidth="15" />
          </svg>
        </button>

        <div className="block pb-4 md:flex justify-start">
          <div className="flex-auto">
            <h2 className="mb-3 mx-8 text-lg text-center font-semibold">{title}</h2>
            <div className="max-h-[70vh] overflow-scroll no-srl-bar print:max-h-none print:overflow-auto">
              {children}
            </div>
          </div>
        </div>
      </Transition>
    </>
  );
}

export function Transition({ Tag, children, base, enter, exit, time = "300", open, ...p }) {
  const [active, setActive] = useState(open);
  const [cls, setCls] = useState(enter);

  useEffect(() => {
    if (open) {
      setActive(true);
      setTimeout(() => setCls(enter), 50);
    } else {
      setCls(exit);
      setTimeout(() => setActive(false), +time + 50);
    }
  }, [open]);

  if (!active) return null;
  return (
    <Tag className={`transition-all duration-${time} ease-in-out ${base} ${cls}`} {...p}>
      {children}
    </Tag>
  );
}

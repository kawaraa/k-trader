"use client";

import { useRef } from "react";

export function EditableInput({ children, id, cls, ...p }) {
  const elRef = useRef();
  if (elRef.current) elRef.current.value = p.defaultValue;

  return (
    <label htmlFor={id} className={`flex items-center overflow-hidden ${cls}`}>
      {children}
      <span className="relative">
        {p.defaultValue}
        <input ref={elRef} id={id} className="w-full absolute inset-0 appearance-none rounded-md" {...p} />
      </span>
    </label>
  );
}

export function ToggleSwitch({ children, label, size = 40, cls, ...p }) {
  const h = Math.round(+size / 2);

  return (
    <div className={`inline-flex items-center ${cls}`}>
      {children}
      <label
        htmlFor={cls}
        dir="ltr"
        style={{ width: `${size}px`, height: `${h}px` }}
        className={`overflow-hidden relative inline-flex items-center rounded-full cursor-pointer`}
      >
        <input
          type="checkbox"
          id={cls}
          className="peer absolute top-0 left-0 w-full h-full appearance-none bg-lbg dark:bg-cbg rounded-full border border-bc checked:bg-pc dark:checked:bg-pc cursor-pointer focus:border-blue "
          {...p}
        />
        <span
          style={{ width: `${h - 2}px`, height: `${h - 2}px` }}
          className={`inline-block bg-bg absolute ml-[2px] border border-bc peer-checked:translate-x-full rounded-full transition-all duration-200`}
        ></span>
      </label>
      <span className="w-2 h-2"></span>
      {label && <span className="text-sm font-medium">{label}</span>}
    </div>
  );
}

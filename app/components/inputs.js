"use client";
// import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cardCls } from "./tailwind-classes";

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

export function CheckInput({ children, cls, labelCLs, ...p }) {
  return (
    <div className={`relative inline-flex justify-center items-center ${cls}`}>
      <input
        className={`peer absolute top-0 left-0 w-full h-full appearance-none border-none z-[-1]`}
        {...p}
      />
      <label
        htmlFor={p.id}
        className={`flex-auto box-border text-center peer-checked:text-blue peer-checked:border-2 peer-checked:border-blue-500 cursor-pointer card ${cardCls} ${labelCLs}`}
      >
        {children}
      </label>
    </div>
  );
}

export default function ComboBox({ items, link, onSelect, cls }) {
  const [foundItems, setFoundItems] = useState(items);

  const search = (text) => {
    if (!text.trim()) return setFoundItems([]);
    setFoundItems(items.filter((it) => it.toLowerCase().includes(text.toLowerCase())));
  };

  // useEffect(() => {
  //   setFoundItems(items);
  // }, [items]);

  return (
    <div className={`relative z-1 ${cls}`}>
      <label
        htmlFor="combobox-input-id"
        className="relative w-full flex overflow-hidden rounded-lg card shadow-md"
      >
        <span
          className="w-6 absolute inset-y-0 right-0 flex items-center "
          aria-haspopup="true"
          aria-expanded="false"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
            className="pointer-events-none w-full"
          >
            <path
              fillRule="evenodd"
              d="M10 3a.75.75 0 01.55.24l3.25 3.5a.75.75 0 11-1.1 1.02L10 4.852 7.3 7.76a.75.75 0 01-1.1-1.02l3.25-3.5A.75.75 0 0110 3zm-3.76 9.2a.75.75 0 011.06.04l2.7 2.908 2.7-2.908a.75.75 0 111.1 1.02l-3.25 3.5a.75.75 0 01-1.1 0l-3.25-3.5a.75.75 0 01.04-1.06z"
              clipRule="evenodd"
            ></path>
          </svg>
          {/* <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 1024 1024"
            className="pointer-events-none w-full"
            fill="currentColor"
            strokeWidth="100"
            aria-hidden="true"
          >
            <path d="m795.904 750.72 124.992 124.928a32 32 0 0 1-45.248 45.248L750.656 795.904a416 416 0 1 1 45.248-45.248zM480 832a352 352 0 1 0 0-704 352 352 0 0 0 0 704z" />
          </svg> */}
        </span>
        <input
          onChange={(e) => search(e.target.value)}
          id="combobox-input-id"
          className="w-full p-1 appearance-none border-none rounded-lg"
          type="text"
          role="combobox"
          aria-controls="combobox-list"
          aria-expanded="false"
        />
      </label>

      {foundItems?.length > 0 && (
        <ul
          class="absolute mt-1 max-h-60 w-full select-none overflow-auto card rounded-md p-1 shadow-lg ring-1 ring-black ring-opacity-5"
          aria-labelledby="combobox-button-:R4q:"
          role="listbox"
          id="combobox-list"
        >
          {foundItems.map((item, i) => {
            let Tag = "a";
            let props = { href: `${link}${item}` };
            if (!link) {
              Tag = "button";
              props = { name: item, onClick: onSelect };
            }

            return (
              <li class="relative" role="option" tabindex="-1" aria-selected="true" key={i}>
                <Tag {...props} className="p-2 flex bg-transparent border-none">
                  {/* <span class="flex items-center text-teal-600">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                    class="h-5 w-5"
                  >
                    <path
                      fill-rule="evenodd"
                      d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                      clip-rule="evenodd"
                    ></path>
                  </svg>
                </span> */}
                  <span class="truncate">{item}</span>
                </Tag>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

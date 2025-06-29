"use client";

export function EditableInput({ children, id, cls, ...p }) {
  // <div dir="auto" className={"relative flex " + (cls || "flex-col")}>
  return (
    <label htmlFor={id} className={`inline-flex items-center ${cls}`}>
      {children}
      <input id={id} className="w-12 bg-cbg appearance-none rounded-md" {...p} />
    </label>
  );
}

export function ToggleSwitch({ children, label, size = 50, cls, ...p }) {
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

"use client";

export default function Loader({ loading, size = "10", screen, cls = "", inCls = "" }) {
  if (!loading) return null;
  let borderSize = Math.round(+size / 8);
  if (borderSize > 6) borderSize = 6;
  const c = !screen ? cls : "fixed inset-0 z-[10] h-screen m-0 bg-blur";

  return (
    <div className={`no-select flex justify-center items-center ${c} ${cls}`} role="img" aria-label="loading">
      <div
        className={`border-t-[transparent] border-pc rounded-full animate-spin ${inCls}`}
        style={{ width: `${size}px`, height: `${size}px`, borderWidth: `${borderSize}px` }}
      ></div>
    </div>
  );
}

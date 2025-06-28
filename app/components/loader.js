"use client";

export default function Loader({ loading }) {
  return (
    loading && (
      <div
        className="no-select h-screen z-9 fixed inset-0 m-0 bg-blur flex justify-center items-center"
        role="img"
        aria-label="loading"
      >
        <div className="border-t-[transparent] border-pc rounded-full animate-spin w-16 h-16 border-[6px]"></div>
      </div>
    )
  );
}

// export default function Loader({ size = "10", screen, wrapperCls = "", cls = "" }) {
//   let borderSize = Math.round(+size / 8);
//   if (borderSize > 7) borderSize = 7;
//   const c = !screen ? wrapperCls : "z-[10] flex justify-center items-center fixed inset-0 " + wrapperCls;
//   return (
//     <div className={`flex justify-center items-center ml-1 ${c}`} role="img" aria-label="loading">
//       <div
//         className={`border-t-[transparent] border-bf rounded-full animate-spin ${cls}`}
//         style={{ width: `${size}px`, height: `${size}px`, borderWidth: `${borderSize}px` }}
//       ></div>
//     </div>
//   );
// }

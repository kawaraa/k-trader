"use client";

export default function Loader({ loading }) {
  return (
    loading && (
      <div
        className={`no-select h-screen z-9 fixed inset-0 m-0 bg-blur flex justify-center items-center `}
        role="img"
        aria-label="loading"
      >
        <div
          className={`border-t-[transparent] border-pc rounded-full animate-spin w-16 h-16 border-[6px]`}
        ></div>
      </div>
    )
  );
}

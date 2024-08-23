"use client";
import Link from "next/link";

export default function PageHeader({ pair }) {
  return (
    <header className="flex px-3 md:px-5 py-4 mb-6 border-b-[1px] border-neutral-300 dark:border-neutral-600 items-end">
      <Link href="/" className="w-12 h-12 ml-2 p-1 flex items-center justify-center rounded-3xl">
        <svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
          <path d="M224 480h640a32 32 0 1 1 0 64H224a32 32 0 0 1 0-64z" />
          <path d="m237.248 512 265.408 265.344a32 32 0 0 1-45.312 45.312l-288-288a32 32 0 0 1 0-45.312l288-288a32 32 0 1 1 45.312 45.312L237.248 512z" />
        </svg>
      </Link>

      <h1 class="mx-auto text-2xl md:text-3xl font-bold">✨ {pair?.replace("EUR", "")} / EUR ✨</h1>
    </header>
  );
}

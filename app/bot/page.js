"use client";
import { useEffect, useRef, useState } from "react";
import { request } from "../../src/utilities";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import RefreshButton from "../components/refresh-button";
import Loader from "../components/loader";

export default function Bot() {
  const searchParams = useSearchParams();
  const pair = searchParams.get("pair");

  const router = useRouter();
  const logsRef = useRef(null);
  const [loading, setLoading] = useState(false);

  const fetchLogContent = async () => {
    setLoading(true);
    logsRef.current.innerText = await request(`/api/bots/logs?pair=${pair}`).catch((err) => err.message);
    logsRef.current?.scroll({ top: logsRef.current?.scrollHeight, behavior: "smooth" });
    setLoading(false);
  };

  useEffect(() => {
    request("/api/auth")
      .catch(() => router.replace("/signin"))
      .then(fetchLogContent());
  }, []);

  return (
    <>
      <main className="flex flex-col h-screen m-0 p-0">
        <header className="flex px-3 md:px-5 py-4 mb-6 border-b-[1px] border-neutral-300 dark:border-neutral-600 items-end justify-between">
          <Link href="/" className="w-12 h-12 ml-2 p-1 flex items-center justify-center rounded-3xl">
            <svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
              <path d="M224 480h640a32 32 0 1 1 0 64H224a32 32 0 0 1 0-64z" />
              <path d="m237.248 512 265.408 265.344a32 32 0 0 1-45.312 45.312l-288-288a32 32 0 0 1 0-45.312l288-288a32 32 0 1 1 45.312 45.312L237.248 512z" />
            </svg>
          </Link>
        </header>

        <div className="flex-1 w-auto px-3 pb-10 flex justify-center overflow-y-auto">
          <pre
            ref={logsRef}
            className="text-xs min-w-full min-h-full max-w-5xl p-3 text-wrap leading-7 rounded-md card overflow-x-auto"
          ></pre>
        </div>
      </main>

      <RefreshButton onClick={fetchLogContent} />

      <Loader loading={loading} />
    </>
  );
}

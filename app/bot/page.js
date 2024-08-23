"use client";
import { useEffect, useRef, useState } from "react";
import { request } from "../../src/utilities";
import { useRouter, useSearchParams } from "next/navigation";
import RefreshButton from "../components/refresh-button";
import Loader from "../components/loader";
import PageHeader from "../components/page-header";

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
      .then(fetchLogContent);
  }, []);

  return (
    <>
      <main className="flex flex-col h-screen m-0 p-0">
        <PageHeader pair={pair} />

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

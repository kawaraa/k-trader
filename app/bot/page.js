"use client";
import { useEffect, useRef, useState } from "react";
import { request } from "../../shared-code/utilities.js";
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
    logsRef.current.innerText = await request(`/api/bots/logs/${pair}`).catch((err) => err.message);
    logsRef.current?.scroll({ top: logsRef.current?.scrollHeight, behavior: "smooth" });
    setLoading(false);
  };

  useEffect(() => {
    request("/api/auth")
      .catch(() => router.replace("/signin"))
      .then(fetchLogContent);

    const eventSource = new EventSource("/api/bots/sse/PEPEEUR", { withCredentials: true });
    eventSource.onopen = () => console.log("SSE connection opened");
    eventSource.onerror = (e) => {
      console.error("Server error:", JSON.parse(e?.data || e?.error || e));
      eventSource.close(); // Close client-side connection
    };
    eventSource.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.log) {
        logsRef.current.innerText += data.log;
        logsRef.current?.scroll({ top: logsRef.current?.scrollHeight, behavior: "smooth" });
      }
    };

    return () => eventSource.close(); // This terminates the connection
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

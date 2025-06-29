"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Trader from "../components/trader";
import { State } from "../state";
import { request } from "../../shared-code/utilities";

export default function TraderPage({}) {
  const params = useSearchParams();
  const { user, setLoading, traders, defaultCapital } = State();
  const logsRef = useRef(null);

  const pair = params.get("pair");

  const fetchLogContent = async (pair) => {
    setLoading(true);
    try {
      logsRef.current.innerText = await request(`/api/logs/${pair}`).catch((err) => err.message);
      logsRef.current?.scroll({ top: logsRef.current?.scrollHeight, behavior: "smooth" });
    } catch (error) {
      logsRef.current.innerText = error.message || JSON.stringify(error);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (user && !user.loading) {
      fetchLogContent(pair);
      if (window?.logsEventSource) window.logsEventSource.close();
      window.logsEventSource = new EventSource(`/api/sse/${pair}/log`, { withCredentials: true });
      logsEventSource.onopen = () => console.log("SSE connection opened");
      logsEventSource.onerror = (e) => {
        console.error("Server error:", JSON.parse(e?.data || e?.error || e));
        logsEventSource.close(); // Close client-side connection
      };
      logsEventSource.onmessage = (e) => {
        const data = JSON.parse(e.data);
        const pair = Object.keys(data)[0];
        console.log("Log", data[pair], data);
        logsRef.current.innerText = data[pair];
      };

      const handler = () => window.logsEventSource.close();
      window.addEventListener("beforeunload", handler);

      // This terminates the connection
      return () => {
        handler();
        window.addEventListener("beforeunload", handler);
      };
    }
  }, [user]);

  return (
    <div className="lg:max-w-[90%] mx-auto">
      <div className={`w-full overflow-y-auto rounded-md`}>
        {user && !user?.loading && (
          <Trader
            pair={pair}
            info={traders[pair] || {}}
            defaultCapital={defaultCapital}
            showZoom={true}
            cls=""
          />
        )}
      </div>

      <div className="aspect-video pt-5 pb-10 flex justify-center overflow-y-auto">
        <pre
          ref={logsRef}
          className="text-xs min-w-full min-h-full max-w-5xl p-3 text-wrap leading-7 rounded-md card overflow-x-auto"
        ></pre>
      </div>
    </div>
  );
}

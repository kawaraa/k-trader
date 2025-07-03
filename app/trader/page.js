"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import Trader from "../components/trader";
import { State } from "../state";
import { request } from "../../shared-code/utilities";
import TimeRangeSelect from "../components/time-range-select";
import TradeTimeSuggestion from "../components/trade-time-suggestion";

export default function TraderPage({}) {
  const router = useRouter();
  const params = useSearchParams();
  const { loading, setLoading, user, traders, defaultCapital } = State();
  const logsRef = useRef(null);
  const pair = params.get("pair");
  const timeRange = +params.get("since") || 6;

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
      logsEventSource.onerror = (error) => {
        console.error("Log: SSE connection error:");
        logsEventSource.close(); // Close client-side connection
      };
      logsEventSource.onmessage = (e) => {
        const { log } = JSON.parse(e.data);
        // const pair = Object.keys(data)[0];
        logsRef.current.innerText += "\n" + log;
        logsRef.current?.scroll({ top: logsRef.current?.scrollHeight, behavior: "smooth" });
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
    <div className="h-[80vh] sm:h-auto lg:max-w-[90%] mx-auto flex flex-col">
      <div className="flex items-center justify-around mb-2">
        <TimeRangeSelect
          name="timeRange"
          id="prices-time-range-trader-page"
          onChange={(e) => router.replace(`/trader/?pair=${pair}&since=${e.target.value}`)}
          defaultValue={timeRange}
        >
          <option value="720">720 hrs</option>
          <option value="1080">1080 hrs</option>
          <option value="1440">1440 hrs</option>
        </TimeRangeSelect>

        <TradeTimeSuggestion cls="flex items-center" />
      </div>

      <div className={`w-full rounded-md`}>
        {user && !user?.loading && !loading && (
          <Trader
            pair={pair}
            info={traders[pair] || {}}
            defaultCapital={defaultCapital}
            timeRange={timeRange}
            showZoom={true}
            cls=""
          />
        )}
      </div>

      <div className="max-h-[80vh] py-5 flex justify-center overflow-y-auto">
        <pre
          ref={logsRef}
          className="text-xs min-w-full min-h-full max-w-5xl p-3 text-wrap leading-7 rounded-md card overflow-x-auto"
        ></pre>
      </div>
    </div>
  );
}

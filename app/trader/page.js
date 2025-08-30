"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import Trader from "../components/trader";
import { State } from "../state";
import { calcPercentageDifference, request } from "../../shared-code/utilities";
import TimeRangeSelect from "../components/time-range-select";
import TradeTimeSuggestion from "../components/trade-time-suggestion";

export default function TraderPage({}) {
  const router = useRouter();
  const params = useSearchParams();
  const { loading, setLoading, user, traders, defaultCapital } = State();
  const logsRef = useRef(null);
  const [currentPrice, setCurrentPrice] = useState(null);
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
      window.calcPct = calcPercentageDifference;
      request(`/api/sse/${pair}`, { method: "PATCH" });

      const connect = (count) => {
        if (window?.traderSse) window.traderSse.close();
        window.traderSse = new EventSource(`/api/sse/${pair}`, { withCredentials: true });
        window.traderSse.onopen = () => console.log("SSE connection opened");
        window.traderSse.onerror = (error) => {
          console.error("Price: SSE connection error:");
          window.traderSse.close(); // Close client-side connection
          if (window.sseRetry && count < 24) setTimeout(() => connect(count + 1), 10000);
        };

        window.traderSse.onmessage = (e) => {
          const { price, logs } = JSON.parse(e.data);
          logsRef.current.innerText += logs;
          logsRef.current?.scroll({ top: logsRef.current?.scrollHeight, behavior: "smooth" });
          setCurrentPrice(price);
          console.log({ price, logs });
        };
      };

      const handler = () => {
        window.sseRetry = false;
        request(`/api/sse/${pair}`, { method: "PATCH" });
        window.traderSse.close();
      };

      window.addEventListener("beforeunload", handler);

      connect(1);
      // This terminates the connection
      return () => {
        handler();
        window.removeEventListener("beforeunload", handler);
      };
    }
  }, [user]);

  useEffect(() => {
    if (!user) router.replace("/login");
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
            priceUpdate={currentPrice}
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

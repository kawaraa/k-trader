"use client";
import { useEffect, useRef, useState } from "react";
import { toShortDate, request } from "../../src/utilities.js";
import { useRouter, useSearchParams } from "next/navigation";
import PageHeader from "../components/page-header";
import Loader from "../components/loader";
import ChartCanvas from "../components/chart-canvas";
import currencies from "../../src/data/currencies.json";
const pairs = Object.keys(currencies);

export default function CryptoChart() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pair = searchParams.get("pair");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [prices, setPrices] = useState([]);
  const pricesRef = useRef([]);
  pricesRef.current = prices;

  const labels = [];
  const askPrices = [];
  const tradePrices = [];
  const bidPrices = [];

  const interval = 5 * 60000;
  const since = Date.now() - prices.length * interval;

  prices.forEach((p, i) => {
    tradePrices.push(p[0]);
    askPrices.push(p[1]);
    bidPrices.push(p[2]);
    labels.push(`${toShortDate(new Date(since + interval * i))}`);
  });

  const changePair = (p) => router.push(`/chart?pair=${p}&other=0`);

  const fetchPrices = async (pair) => {
    setLoading(true);
    try {
      const prices = await request(`/api/bots/prices/${pair}`);
      setPrices(makePricesArray(prices));
    } catch (error) {
      setError(error.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchPrices(`${pair}?other=${searchParams.get("other")}`);

    const eventSource = new EventSource("/api/bots/sse/PEPEEUR", { withCredentials: true });
    eventSource.onopen = () => console.log("SSE connection opened");
    eventSource.onerror = (e) => {
      console.error("Server error:", JSON.parse(e?.data || e?.error || e));
      eventSource.close(); // Close client-side connection
    };
    eventSource.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.prices) setPrices(pricesRef.current.concat(data.prices));
    };

    return () => eventSource.close(); // This terminates the connection
  }, [pair]);

  useEffect(() => {
    window.profit = (previousPrice, currentPrice, investedAmount = 9) => {
      const earningsIncludedProfit = (investedAmount / previousPrice) * currentPrice;
      return (+(earningsIncludedProfit - investedAmount).toFixed(8) + amt) * 0.992; // Return the Profit;
    };
    window.percentage = (oldPrice, newPrice) => {
      const difference = newPrice - oldPrice;
      return +(newPrice > oldPrice ? (100 * difference) / newPrice : (difference / oldPrice) * 100).toFixed(
        2
      );
    };

    !pair && changePair(pairs[0]);
    request("/api/auth")
      .catch(() => router.replace("/signin"))
      .then(() => !pair && changePair(pairs[0]));
  }, []);

  return (
    <>
      <main className="flex flex-col h-screen m-0 p-0">
        <PageHeader pair={pair}>
          <select
            name="pair"
            onChange={(e) => changePair(e.target.value)}
            defaultValue={pair}
            className="mr-5 text-[#334155] text-center sm:text-lg bg-amber-100 py-1 px-3 appearance-none outline-none border-[1px] focus:border-blue rounded-md"
          >
            {pairs.map((pair, i) => (
              <option value={pair} key={i}>
                {pair}
              </option>
            ))}
          </select>
        </PageHeader>

        {error && <p className="my-5 text-red">{error}</p>}

        <label className="flex flex-auto items-center">
          <input
            id="smoother"
            type="range"
            min="0"
            max="30"
            step="1"
            defaultValue="0"
            onChange={(e) => setPrices(smoothPrices2(prices))}
            className="flex-auto h-2 cursor-pointer appearance-none bg-gray-200 dark:bg-gray-700 rounded-lg"
          />
        </label>

        <ChartCanvas
          type="line"
          labels={labels}
          datasets={[
            {
              label: "Ask Price",
              borderColor: "#FFA500",
              fill: false,
              data: askPrices,
              pointStyle: false,
              borderWidth: 1, // Adjust the line thickness
              // pointRadius: 0, // Adjust the size of the points on the line
              // borderDash: [3, 2],
              // fill: "+2",
            },
            {
              label: "Trade Price",
              borderColor: "#008080",
              fill: false,
              data: tradePrices,
              hidden: true,
              pointStyle: false,
              borderWidth: 1, // Adjust the line thickness
              // borderDash: [3, 2],
            },
            {
              label: "Bid Price",
              borderColor: "#800080",
              fill: false,
              data: bidPrices,
              pointStyle: false,
              borderWidth: 1, // Adjust the line thickness
              // borderDash: [3, 2],
            },
          ]}
          options={{ responsive: true, maintainAspectRatio: false }}
        />
      </main>

      <Loader loading={loading} />
    </>
  );
}

function makePricesArray(prices) {
  if (!prices[0]?.askPrice) return prices;
  return prices.map((p) => [p.tradePrice, p.askPrice, p.bidPrice]);
}

function smoothPrices2(prices, range = 2) {
  return prices.map((_, i, arr) => {
    const slice = arr.slice(Math.max(0, i - 2), i + 1);

    if (!slice[0][0]) return slice.reduce((a, b) => a + b, 0) / slice.length;
    else {
      return [
        slice.reduce((a, b) => a[0] + b[0], 0) / slice.length,
        slice.reduce((a, b) => a[1] + b[1], 0) / slice.length,
        slice.reduce((a, b) => a[2] + b[2], 0) / slice.length,
      ];
    }
  });

  // // This remove noises from prices using a moving average
  // if (range < 1 || range > prices.length) return prices;

  // const result = [];
  // for (let i = 0; i < prices.length; i += range) {
  //   const slice = prices.slice(i, Math.max(i, i + range));
  //   if (!slice[0].tradePrice) result.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  //   else {
  //     result.push({
  //       tradePrice: slice.reduce((a, b) => a + b.tradePrice, 0) / slice.length,
  //       askPrice: slice.reduce((a, b) => a + b.askPrice, 0) / slice.length,
  //       bidPrice: slice.reduce((a, b) => a + b.bidPrice, 0) / slice.length,
  //     });
  //   }
  // }

  // return result;
}

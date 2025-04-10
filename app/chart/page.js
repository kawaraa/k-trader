"use client";
import { useEffect, useState } from "react";
import { toShortDate, request } from "../../src/utilities";
import { useRouter, useSearchParams } from "next/navigation";
import PageHeader from "../components/page-header";
import Loader from "../components/loader";
import ChartCanvas from "../components/chart-canvas";
const pairs = Object.keys(require("../../src/currencies.json"));

export default function CryptoChart() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pair = searchParams.get("pair");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [prices, setPrices] = useState([]);

  const labels = [];
  const askPrices = [];
  const tradePrices = [];
  const bidPrices = [];

  const interval = 5 * 60000;
  const since = Date.now() - prices.length * interval;

  prices.forEach((p, i) => {
    tradePrices.push(p.tradePrice);
    askPrices.push(p.askPrice);
    bidPrices.push(p.bidPrice);
    labels.push(`${toShortDate(new Date(since + interval * i))}`);
  });

  const changePair = (p) => router.push(`/chart?pair=${p}&other=0`);

  const fetchPrices = async (pair) => {
    setLoading(true);
    try {
      const prices = await request(`/api/bots/prices/${pair}`);
      setPrices(prices);
    } catch (error) {
      setError(error.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchPrices(`${pair}?other=${searchParams.get("other")}`);
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
    // request("/api/auth")
    //   .catch(() => router.replace("/signin"))
    //   .then(() => !pair && changePair(pairs[0]));
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

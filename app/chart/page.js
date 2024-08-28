"use client";
import { useEffect, useState } from "react";
import { request } from "../../src/utilities";
import { useRouter, useSearchParams } from "next/navigation";
import PageHeader from "../components/page-header";
import Loader from "../components/loader";
import ChartCanvas from "../components/chart-canvas";
import pairs from "../../src/pairs";
import { calcInvestmentProfit, calcPercentageDifference } from "../../src/trend-analysis";

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

  prices.forEach((p, i) => {
    tradePrices.push(p.tradePrice);
    askPrices.push(p.askPrice);
    bidPrices.push(p.bidPrice);
    labels.push(
      i * 5 < 60
        ? parseInt(i * 5) + " M"
        : i * 5 < 1440
        ? parseInt((i * 5) / 60) + " H"
        : ((i * 5) / 60 / 24).toFixed(1) + " D"
    ); // Time labels
  });

  const changePair = (p) => router.push(`/chart?pair=${p}`);

  const fetchPrices = async (pair) => {
    setLoading(true);
    try {
      if (pair) setPrices(await request(`/api/prices/${pair}.json`));
    } catch (error) {
      setError(error.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchPrices(pair);
  }, [pair]);

  useEffect(() => {
    window.profit = (ask, bid, amt = 9) => (calcInvestmentProfit(ask, bid, amt) + amt) * 0.992;
    window.percentage = (past, current) => `${calcPercentageDifference(past, current)}%`;

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
          options={{
            responsive: true,
            maintainAspectRatio: false,
            elements: {
              point: {
                radius: 2, // Smaller points for mobile
              },
            },
          }}
        />
      </main>

      <Loader loading={loading} />
    </>
  );
}

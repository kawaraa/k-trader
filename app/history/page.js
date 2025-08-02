"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import ChartCanvas from "../components/chart-canvas.js";
import { request, toShortDate } from "../../shared-code/utilities.js";

const defaultChartData = { prices: [], volumes: [], market_caps: [], labels: [] };

export default function CryptoChart() {
  const params = useSearchParams();
  const [chartData, setChartData] = useState(defaultChartData);

  const [error, setError] = useState("");

  const pair = params.get("pair");

  const fetchHistory = async (pair) => {
    try {
      const history = await request(`/${pair}-history.json`);
      const prices = [];
      const volumes = [];
      const market_caps = [];
      const labels = [];

      history.forEach((item, i) => {
        prices.push(item.price);
        volumes.push(item.volume); // (item.volume * item.close_price / 1000000).toFixed(3
        market_caps.push(item.market_cap);
        labels.push(item.date);
      });

      setError("");
      setChartData({ prices, volumes, volumes, labels });
    } catch (error) {
      setError(error.message);
    }
  };

  useEffect(() => {
    fetchHistory(pair);
  }, [pair]);

  return (
    <main className="h-[75vh] flex flex-col h-screen m-0 p-0">
      {error || (
        <ChartCanvas
          type="line"
          showZoom={true}
          zoomStep={10}
          labels={chartData.labels}
          datasets={[
            {
              label: "Normalized Price",
              borderColor: "#008080",
              fill: false,
              data: chartData.prices,
              pointStyle: false,
              borderWidth: 1,
            },
          ]}
          options={{ responsive: true, maintainAspectRatio: false }}
        />
      )}
    </main>
  );
}

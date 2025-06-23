"use client";
import { useState } from "react";
import { toShortDate } from "../../../src/utilities.js";
import PageHeader from "../../components/page-header";
import ChartCanvas from "../../components/chart-canvas";

export default function CryptoChart() {
  const [prices, setPrices] = useState([]);

  const interval = 5 * 60000;
  const since = Date.now() - prices.length * interval;

  const labels = prices.map((p, i) => `${toShortDate(new Date(since + interval * i))}`);

  return (
    <>
      <main className="flex flex-col h-screen m-0 p-0">
        <PageHeader pair="Data Chart Viewer">
          <div className="">
            <textarea
              name="prices"
              id="prices"
              onChange={(e) => setPrices(JSON.parse(e.target.value))}
              col="40"
            ></textarea>
          </div>
        </PageHeader>

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
              label: "Normalized Price",
              borderColor: "#008080",
              fill: false,
              data: prices,
              pointStyle: false,
              borderWidth: 1,
            },
          ]}
          options={{ responsive: true, maintainAspectRatio: false }}
        />
      </main>
    </>
  );
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

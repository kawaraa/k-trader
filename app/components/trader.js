"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { borderCls } from "./tailwind-classes";
import { EditableInput } from "./inputs";
// import MultiLineChart from "./c";
import ChartCanvas from "./chart-canvas";
import Loader from "./loader";
import { request, toShortDate } from "../../shared-code/utilities";
// const sum = (arr) => arr.reduce((acc, num) => acc + num, 0);

export default function Trader({ pair, info, onAction, defaultCapital }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tradePrices, setTradePrices] = useState([]);
  const [askPrices, setAskPrices] = useState([]);
  const [bidPrices, setBidPrices] = useState([]);
  const [volumes, setVolumes] = useState([]);
  const [labels, setLabels] = useState([]);
  const totalReturn = info.trades.reduce((acc, t) => acc + t, 0);
  const interval = 5 * 60000;

  const handleSeCapital = (e) => {
    console.log(e.target.value);
  };

  const fetchPrices = async (pair) => {
    // setLoading(true);
    try {
      const prices = await request(`/api/prices/${pair}`);
      console.log(prices.length);

      const since = Date.now() - prices.length * interval;
      const tradePrices = [];
      const askPrices = [];
      const bidPrices = [];
      const volumes = [];
      const labels = [];

      prices.forEach((p, i) => {
        tradePrices.push(p[0]);
        askPrices.push(p[1]);
        bidPrices.push(p[2]);
        volumes.push(p[3]);
        labels.push(`${toShortDate(new Date(since + interval * i))}`);
      });

      setTradePrices(tradePrices);
      setAskPrices(askPrices);
      setBidPrices(bidPrices);
      setVolumes(volumes);
      setLabels(labels);
    } catch (error) {
      setError(error.message);
    }
    // setLoading(false);
  };

  // console.log(tradePrices);

  useEffect(() => {
    fetchPrices(pair);
    // const eventSource = new EventSource("/api/bots/sse/PEPEEUR", { withCredentials: true });
    // eventSource.onopen = () => console.log("SSE connection opened");
    // eventSource.onerror = (e) => {
    //   console.error("Server error:", JSON.parse(e?.data || e?.error || e));
    //   eventSource.close(); // Close client-side connection
    // };
    // eventSource.onmessage = (e) => {
    //   const data = JSON.parse(e.data);
    //   if (data.prices) setPrices((prev) => [...prev, data.prices].slice(-5000));
    // };

    // return () => eventSource.close(); // This terminates the connection
  }, [pair]);

  return (
    <li className={`w-full lg:w-1/2 xl:w-1/3 overflow-y-auto rounded-md`}>
      <div className={`mb-1 lg:mr-1 xl:mx-1 no-srl-bar card rounded-md ${borderCls}`}>
        <div className="flex items-center justify-between py-1 px-2 border-t-[1px] border-slate-200">
          <strong className="w-18">
            {pair.replace("EUR", "")} ({info.balance || 0})
          </strong>

          <span className={totalReturn < 0 ? "text-red" : "text-green"}>€{totalReturn}</span>

          <EditableInput
            id={pair}
            onBlur={handleSeCapital}
            defaultValue={info.capital || defaultCapital}
            cls="text-orange"
          >
            €
          </EditableInput>
          {/* <div className="flex items-center">
            <strong>Prices charts</strong>:
            <p className="ml-2 text-pc font-semi-bold">
              <Link href={`/chart?pair=${pair}`} className="underline underline-offset-4 mr-3">
                Stored
              </Link>
              <Link
                href={`https://pro.kraken.com/app/trade/${pair?.replace("EUR", "").toLowerCase()}-eur`}
                target="_blank"
                referrerPolicy="no-referrer"
                className="underline underline-offset-4"
              >
                Live
              </Link>
            </p>
          </div> */}

          <Link href={`/bot?pair=${pair}`} className="w-6 h-6 flex text-pc">
            <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="none">
              <g fill="currentColor">
                <path d="M5.314 1.256a.75.75 0 01-.07 1.058L3.889 3.5l1.355 1.186a.75.75 0 11-.988 1.128l-2-1.75a.75.75 0 010-1.128l2-1.75a.75.75 0 011.058.07zM7.186 1.256a.75.75 0 00.07 1.058L8.611 3.5 7.256 4.686a.75.75 0 10.988 1.128l2-1.75a.75.75 0 000-1.128l-2-1.75a.75.75 0 00-1.058.07zM2.75 7.5a.75.75 0 000 1.5h10.5a.75.75 0 000-1.5H2.75zM2 11.25a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75zM2.75 13.5a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5z"></path>
              </g>
            </svg>
          </Link>

          <button
            onClick={() => onAction("buy", pair)}
            className="text-white rounded-md py-1 px-2 bg-red-400"
          >
            Buy
          </button>

          <button
            onClick={() => onAction("sell", pair)}
            className="text-white rounded-md py-1 px-2 bg-amber-500"
          >
            Sell
          </button>
        </div>

        <div className={`flex flex-col overflow-hidden h-60`}>
          <ChartCanvas
            labels={labels}
            datasets={[
              {
                label: "Trade Price",
                borderColor: "#008080",
                fill: false,
                data: tradePrices,
                hidden: true,
                pointStyle: false,
                borderWidth: 1,
              },
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
                label: "Bid Price",
                borderColor: "#800080",
                fill: false,
                data: bidPrices,
                pointStyle: false,
                borderWidth: 1,
              },
              // {
              //   label: "volumes",
              //   borderColor: "#3cba9f",
              //   fill: false,
              //   data: volumes,
              //   pointStyle: false,
              //   borderWidth: 1,
              // },
            ]}
            options={{ responsive: true, maintainAspectRatio: false, animation: false }}
          />

          <Loader loading={loading} />
          {error && <p>{error}</p>}
        </div>
      </div>
    </li>
  );
}

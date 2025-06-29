"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { borderCls } from "./tailwind-classes";
import { EditableInput } from "./inputs";
import ChartCanvas from "./chart-canvas";
// import Loader from "./loader";
import { calcPercentageDifference, request } from "../../shared-code/utilities.js";
import TimeRangeSelect from "./time-range-select.js";

const getTime = (d) => d.toTimeString().split(" ")[0].substring(0, 5);
const normalizeNum = (num) => (num >= 1 ? num : +`0.${parseInt(num?.toString().replace("0.", ""))}` || 0);

// const sum = (arr) => arr.reduce((acc, num) => acc + num, 0);

export default function Trader({ pair, info, defaultCapital, cls, timeRange, showZoom }) {
  // const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [capital, setCapital] = useState(info.capital || defaultCapital);
  const [tradePrices, setTradePrices] = useState([]);
  const [askPrices, setAskPrices] = useState([]);
  const [bidPrices, setBidPrices] = useState([]);
  const [volumes, setVolumes] = useState([]);
  const [labels, setLabels] = useState([]);
  const [pricesTimeRange, setPricesTimeRange] = useState(12);
  const totalReturn = info.trades?.reduce((acc, t) => acc + t, 0) || 0;

  const volatility = calcPercentageDifference(Math.min(...tradePrices) || 0, Math.max(...tradePrices) || 0);

  const lengthLimit = ((timeRange || pricesTimeRange) * 60 * 60) / 10;

  const handleSeCapital = async (e) => {
    const newCapital = +e.target.value || 0;
    if (!confirm(`Are you sure want increase investment capital for ${pair}`)) return;
    // setLoading(true);
    try {
      await request(`/api/trader/update/${pair}/${newCapital}`, { method: "PUT" });
      setCapital(newCapital);
    } catch (error) {
      alert(JSON.stringify(error.message || error.error || error));
    }
    // setLoading(false);
  };

  const placePosition = async (type = "sell") => {
    // setLoading(true);
    if (!confirm(`Are you sure want to ${type} "${pair}" currency?`)) return;
    try {
      await request(`/api/trader/${type}/${pair}`, { method: "PATCH" });
      setError("");
    } catch (error) {
      setError(error.message);
    }
    console.log(type);
    // setLoading(true);
  };

  const fetchPrices = async (pair) => {
    try {
      const interval = 5 * 60000;
      const prices = await request(`/api/prices/${pair}?since=${timeRange || pricesTimeRange}&interval=10`);

      const since = Date.now() - prices.length * interval;
      const tradePrices = [];
      const askPrices = [];
      const bidPrices = [];
      const volumes = [];
      const labels = [];

      prices.forEach((p, i) => {
        tradePrices.push(normalizeNum(p[0]));
        askPrices.push(normalizeNum(p[1]));
        bidPrices.push(normalizeNum(p[2]));
        volumes.push(parseInt(normalizeNum(p[3]) / 1000));
        labels.push(`${getTime(new Date(since + interval * i))}`);
      });

      setTradePrices(tradePrices);
      setAskPrices(askPrices);
      setBidPrices(bidPrices);
      setVolumes(volumes);
      setLabels(labels);
    } catch (error) {
      setError(error.message);
    }
  };

  useEffect(() => {
    if (!capital || defaultCapital == 0) setCapital(defaultCapital);
  }, [defaultCapital]);

  useEffect(() => {
    fetchPrices(pair);
  }, [timeRange, pricesTimeRange]);

  useEffect(() => {
    fetchPrices(pair);

    const handler = (event) => {
      const price = event.detail;
      console.log("price:", price);
      const newTradePrices = tradePrices.slice(-lengthLimit);
      const newAskPrices = askPrices.slice(-lengthLimit);
      const newBidPrices = bidPrices.slice(-lengthLimit);
      const newVolumes = volumes.slice(-lengthLimit);
      const newLabels = labels.slice(-lengthLimit);

      newTradePrices.push(normalizeNum(price[0]));
      newAskPrices.push(normalizeNum(price[1]));
      newBidPrices.push(normalizeNum(price[2]));
      newVolumes.push(parseInt(normalizeNum(price[3]) / 1000));
      newLabels.push(`${getTime(new Date())}`);

      setTradePrices(newTradePrices);
      setAskPrices(newAskPrices);
      setBidPrices(newBidPrices);
      setVolumes(newVolumes);
      setLabels(newLabels);
    };

    window.addEventListener(pair, handler);

    // This terminates the connection
    return () => {
      window.removeEventListener(pair, handler);
    };
  }, []);

  return (
    <div className={`aspect-video no-srl-bar card rounded-md ${borderCls} ${cls}`}>
      <div className="flex items-center justify-between py-1 px-2 border-t-[1px] border-slate-200">
        <p className="flex gap-1">
          <span className="">{pair.replace("EUR", "")}</span>
          <strong>({info.balance || 0})</strong>
        </p>

        <EditableInput
          id={pair}
          onBlur={handleSeCapital}
          defaultValue={capital || 0}
          cls="text-orange flex-shrink-0 font-bold"
        >
          €
        </EditableInput>

        <strong className={totalReturn < 0 ? "text-red" : "text-green"}>€{totalReturn}</strong>

        <strong className="text-red">{volatility}%</strong>

        {showZoom && !timeRange && (
          <div className="flex items-center">
            <TimeRangeSelect
              name="timeRange"
              id="prices-time-range"
              onChange={(e) => setPricesTimeRange(+e.target.value)}
              defaultValue={pricesTimeRange}
            >
              <option value="720">720 hours</option>
            </TimeRangeSelect>
          </div>
        )}

        <button onClick={() => placePosition("buy")} className="text-white rounded-md py-1 px-2 bg-red">
          Buy
        </button>

        <button
          onClick={() => placePosition("sell")}
          className="text-white rounded-md py-1 px-2 bg-amber-500"
        >
          Sell
        </button>
      </div>

      <Link href={`/trader?pair=${pair}`} className={`h-full flex flex-col overflow-hidden`}>
        {error ? (
          <p>{error}</p>
        ) : (
          <ChartCanvas
            showZoom={showZoom}
            labels={labels}
            datasets={[
              {
                label: "Trade Price",
                data: tradePrices,
                borderColor: "#008080",
                fill: false,
                hidden: true,
                pointStyle: false,
                borderWidth: 1,
              },
              {
                label: "Ask Price",
                data: askPrices,
                borderColor: "#FFA500",
                fill: false,
                pointStyle: false,
                borderWidth: 1, // Adjust the line thickness
                // pointRadius: 0, // Adjust the size of the points on the line
                // borderDash: [3, 2],
                // fill: "+2",
              },
              {
                label: "Bid Price",
                data: bidPrices,
                borderColor: "#800080",
                fill: false,
                pointStyle: false,
                borderWidth: 1,
              },
              {
                label: "Volumes",
                data: volumes,
                yAxisID: "y1",
                borderColor: "#3cba9f",
                fill: false,
                pointStyle: false,
                borderWidth: 1,
              },
            ]}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              animation: false,
              scales: {
                y: { position: "right", grid: { drawOnChartArea: true } },
                y1: { position: "left", grid: { drawOnChartArea: false } },
                // drawOnChartArea: false => Avoid double grid lines
              },
            }}
          />
        )}

        {/* <Loader loading={loading} /> */}
      </Link>
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { borderCls } from "./tailwind-classes";
import { EditableInput } from "./inputs";
import ChartCanvas from "./chart-canvas";
import { calcPercentageDifference, request, toShortDate } from "../../shared-code/utilities.js";
import Loader from "./loader.js";

const getTime = (d) => d.toUTCString().split(" ").at(-2).substring(0, 5);
// const normalizeNum = (num) => (num >= 1 ? num : +`0.${parseInt(num?.toString().replace("0.", ""))}` || 0);
// const sum = (arr) => arr.reduce((acc, num) => acc + num, 0);

export default function Trader({ pair, info, defaultCapital, cls, timeRange = 6, showZoom, live }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [capital, setCapital] = useState(info.capital || 0);
  const [tradePrices, setTradePrices] = useState([]);
  const [askPrices, setAskPrices] = useState([]);
  const [bidPrices, setBidPrices] = useState([]);
  const [volumes, setVolumes] = useState([]);
  const [labels, setLabels] = useState([]);
  const [disabled, setDisabled] = useState(false);
  const totalReturn = parseInt(info.trades?.reduce((acc, t) => acc + t, 0)) || 0;
  const volatility = calcPercentageDifference(Math.min(...tradePrices), Math.max(...tradePrices));

  const lengthLimit = (timeRange * 60 * 60) / 10;

  const handleSetCapital = async (e) => {
    const newCapital = +e.target.value || 0;
    if (!confirm(`Are you sure want increase investment capital for ${pair}`)) return;
    setLoading(true);
    try {
      await request(`/api/trader/update/${pair}/${newCapital}`, { method: "PUT" });
      setCapital(newCapital);
    } catch (error) {
      alert(JSON.stringify(error.message || error.error || error));
    }
    setLoading(false);
  };

  const placePosition = async (type = "sell") => {
    if (!confirm(`Are you sure want to ${type} "${pair}" currency?`)) return;
    setLoading(true);
    try {
      await request(`/api/trader/${type}/${pair}`, { method: "PATCH" });
    } catch (error) {
      alert(JSON.stringify(error.message || error.error || error));
    }
    setLoading(false);
  };

  const enableDisable = async () => {
    if (!confirm(`Are you sure want to ${info.disabled ? "enable" : "disable"} "${pair}" currency?`)) return;
    setLoading(true);
    try {
      await request(`/api/trader/enable-disable/${pair}`, { method: "POST" });
      setDisabled(!disabled);
    } catch (error) {
      alert(JSON.stringify(error.message || error.error || error));
    }
    setLoading(false);
  };

  const fetchPrices = async (pair) => {
    try {
      const interval = 10 * 1000;
      const sse = !live ? "" : `&live=true`;
      const prices = await request(`/api/prices/${pair}?since=${timeRange}&interval=10${sse}`);

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
        volumes.push(+(p[3] / 1000000).toFixed(3));
        const timeFun = timeRange > 24 ? toShortDate : getTime;
        labels.push(`${timeFun(new Date(since + interval * i))}`);
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
    setCapital(!info.capital && defaultCapital >= 0 ? defaultCapital : info.capital);
  }, [info.capital, defaultCapital]);

  useEffect(() => {
    fetchPrices(pair);
  }, [timeRange]);

  useEffect(() => {
    setDisabled(info.disabled);
  }, [info.disabled]);

  useEffect(() => {
    fetchPrices(pair);

    const handler = (event) => {
      const price = event.detail;
      const timeFun = timeRange > 24 ? toShortDate : getTime;

      setTradePrices((prev) => prev.concat([price[0]]).slice(-lengthLimit));
      setAskPrices((prev) => prev.concat([price[1]]).slice(-lengthLimit));
      setBidPrices((prev) => prev.concat([price[2]]).slice(-lengthLimit));
      setVolumes((prev) => prev.concat([+(price[3] / 1000000).toFixed(3)]).slice(-lengthLimit));
      setLabels((prev) => prev.concat([`${timeFun(new Date())}`]).slice(-lengthLimit));
    };

    window.addEventListener(pair, handler);

    // This terminates the connection
    return () => {
      request(`/api/prices/event/${pair}`, { method: "PATCH" });
      window.removeEventListener(pair, handler);
    };
  }, []);

  return (
    <div className={`relative aspect-video no-srl-bar card rounded-md ${borderCls} ${cls}`}>
      <div className="flex items-center justify-between py-1 px-2">
        <button onClick={enableDisable} className={`rounded-md py-0 px-1 ${disabled && "bg-gray-200"}`}>
          {pair.replace("EUR", "")}
        </button>

        <EditableInput
          type="number"
          min="0"
          id={pair}
          onBlur={handleSetCapital}
          defaultValue={capital || 0}
          cls="text-orange flex-shrink-0 font-bold"
        >
          €
        </EditableInput>

        <strong className={totalReturn < 0 ? "text-red" : "text-green"}>€{totalReturn}</strong>

        <strong className="">{volatility.toFixed(1)}%</strong>

        <button
          onClick={() => placePosition("buy")}
          className="text-white text-sm rounded-md py-0 px-1 bg-red"
        >
          Buy
        </button>

        <button
          onClick={() => placePosition("sell")}
          className="text-white text-sm rounded-md py-0 px-1 bg-amber-500"
        >
          Sell
        </button>
      </div>

      {info.balance && (
        <div className="flex items-center justify-between py-0 px-2 text-sm">
          <strong>({info.balance || 0})</strong>
        </div>
      )}

      <RenderWrapper
        Tag={showZoom ? "div" : Link}
        href={showZoom ? null : `/trader?pair=${pair}&since=48`}
        className={`h-full flex flex-col overflow-hidden`}
      >
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
      </RenderWrapper>

      <Loader loading={loading} size="40" cls="absolute inset-0 w-ful h-full bg-blur" />
    </div>
  );
}

const RenderWrapper = ({ Tag, children, ...p }) => {
  return <Tag {...p}>{children}</Tag>;
};

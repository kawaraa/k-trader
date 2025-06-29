"use client";
import ChartCanvas from "./chart-canvas.js";
import { borderCls } from "./tailwind-classes.js";
const getTime = (d) => `${d.getHours()}:${d.getMinutes()}`;
const normalizeNum = (num) => (num >= 1 ? num : `0.${parseInt(num.toString().replace("0.", ""))}`);

export default function AssetItem({ prices }) {
  // const router = useRouter();
  // const searchParams = useSearchParams();
  // const pair = searchParams.get("pair");
  // const [loading, setLoading] = useState(false);
  // const [error, setError] = useState("");
  // const [prices, setPrices] = useState([]);

  const labels = [];
  const askPrices = [];
  const tradePrices = [];
  const bidPrices = [];
  const volumes = [];

  const interval = 10 * 1000;
  const since = Date.now() - prices.length * interval;

  prices.forEach((p, i) => {
    tradePrices.push(normalizeNum(p[0]));
    askPrices.push(normalizeNum(p[1]));
    bidPrices.push(normalizeNum(p[2]));
    volumes.push(normalizeNum(p[3]));
    labels.push(`${getTime(new Date(since + interval * i))}`);
  });

  return (
    <li className={`mb-3 p-2 overflow-y-auto no-srl-bar card rounded-md ${borderCls}`}>
      pair - balance - capital - earnings - Logs - buy - sell
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
            borderWidth: 1,
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
            borderWidth: 1,
          },
          {
            label: "Bid Price",
            borderColor: "#800080",
            fill: false,
            data: bidPrices,
            pointStyle: false,
            borderWidth: 1,
          },
          {
            label: "Volume",
            borderColor: "#0f7afd",
            fill: false,
            data: volumes,
            pointStyle: false,
            borderWidth: 1,
          },
        ]}
        options={{ responsive: true, maintainAspectRatio: false, animation: false }}
      />
    </li>
  );
}

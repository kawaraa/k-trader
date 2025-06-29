"use client";
import { useEffect, useState } from "react";
import Trader from "./components/trader.js";
import { useRouter } from "next/navigation";
import { request, dateToString } from "../shared-code/utilities.js";
import { State } from "./state.js";

const badgeCls =
  "inline-block h-5 min-w-5 px-1 text-sm absolute bottom-6 flex justify-center items-center text-white rounded-full";
// const sum = (arr) => arr.reduce((acc, num) => acc + num, 0);

export default function Home() {
  const router = useRouter();
  const { loading, setLoading, user, traders, defaultCapital } = State();
  const [bots, setBots] = useState({});
  const [orderbyTime, setOrderbyTime] = useState(false);
  const catchErr = (er) => alert(er.message || er.error || er);
  const botsPairs = Object.keys(bots);
  const pairs = Object.keys(traders);

  // const sortedBots = orderbyTime
  //   ? botsPairs.toSorted((p1, p2) => Date.parse(bots[p1].createTime) - Date.parse(bots[p2].createTime))
  //   : botsPairs.toSorted((p1, p2) => sum(bots[p2].trades) - sum(bots[p1].trades));

  const sellAll = async (pair) => {
    if (!confirm(`Are you sure want to sell all the order for "${pair}" currency?`)) return;
    setLoading(true);
    try {
      await request(`/api/bots/position/${pair}`, { method: "PUT" });
    } catch (error) {
      alert(JSON.stringify(error.message || error.error || error));
    }
    setLoading(false);
  };

  const handleActions = async (action, pair) => {
    if (action == "rest") resetState(pair);
    else if (action == "sell-all") sellAll(pair);
    else if (["turn-on", "turn-off"].includes(action.replace("-all", ""))) {
      if (!confirm(`Do you want to ${action} "${pair}" Bot?`)) return;
      setLoading(true);
      const url = `/api/bots?pair=${pair}&status=${action.replace("turn-", "")}`;
      await request(url, { method: "PATCH" }).catch(catchErr);
      if (!["turn-on-all", "turn-off-all"].includes(action)) {
        const startedOn = action == "turn-off" ? null : dateToString();
        const copy = { ...bots };
        copy[pair].startedOn = startedOn;
        setBots(copy);
      }
      setLoading(false);
    }
  };

  const resetState = async (pair) => {
    if (!confirm(`Are you sure want to rest the state of "${pair || "all"}" pair?`)) return;
    setLoading(true);
    try {
      await request(`/api/bots/reset?pair=${pair}`, { method: "PUT" });
      const copy = { ...bots };
      if (copy[pair]) {
        copy[pair].trades = [];
      } else {
        for (const p in copy) {
          copy[p].trades = [];
        }
      }
      setBots(copy);
    } catch (error) {
      alert(JSON.stringify(error.message || error.error || error));
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!user?.loading && !user?.name) router.replace("/login");
  }, [user]);

  return (
    <ul className="flex flex-wrap no-select mb-8 justify-center">
      {pairs.map((pair) => (
        <Trader
          pair={pair}
          info={traders[pair]}
          defaultCapital={defaultCapital}
          onAction={handleActions}
          key={pair}
        />
      ))}
    </ul>
  );
}

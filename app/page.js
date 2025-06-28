"use client";
import { useEffect, useState } from "react";
import BotItem from "./components/bot-item";
import { useRouter } from "next/navigation";
import { request, dateToString } from "../shared-code/utilities.js";
import { State } from "./state.js";
console.log(process.env.NEXT_PUBLIC_VAPID_KEY);
// const key = config.NEXT_PUBLIC_VAPID_KEY;

const badgeCls =
  "inline-block h-5 min-w-5 px-1 text-sm absolute bottom-6 flex justify-center items-center text-white rounded-full";
// const sum = (arr) => arr.reduce((acc, num) => acc + num, 0);

export default function Home() {
  const router = useRouter();
  const { loading, setLoading, user, traders } = State();
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
    <>
      <main className="no-select px-3 sm:px-5 py-6 mb-8 max-w-2xl mx-auto">
        <ul className="pt-4">
          {/* {pairs.map((pair) => (
            <BotItem botInfo={{ pair, ...bots[pair] }} onAction={handleActions} key={pair} />
          ))} */}
        </ul>
      </main>
    </>
  );
}

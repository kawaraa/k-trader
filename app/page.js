"use client";
import { useEffect, useState } from "react";
import BotItem from "./components/bot-item";
import { Modal } from "./components/modal";
import AddBotFrom from "./components/add-bot-form";
import { useRouter } from "next/navigation";
import { dateToString, request } from "../src/utilities";
import { btnCls } from "./components/tailwind-classes";
import Loader from "./components/loader";
import RefreshButton from "./components/refresh-button";
const badgeCls =
  "inline-block h-5 min-w-5 px-1 text-sm absolute bottom-6 flex justify-center items-center text-white rounded-full";

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState(0);
  const [bots, setBots] = useState({});
  const [botToUpdate, setBotToUpdate] = useState(null);
  const [showAddBotForm, setShowAddBotForm] = useState(false);
  const close = () => setShowAddBotForm(false) + setBotToUpdate(null);
  const catchErr = (er) => alert(er.message || er.error || er);
  const botsPairs = Object.keys(bots);
  const stringKeys = ["pair", "mode", "rsiMode"];

  const add = async (e) => {
    e.preventDefault();
    setLoading(true);
    const data = {};
    let method = "POST";
    try {
      new FormData(e.target).forEach((v, k) => (data[k] = stringKeys.includes(k) ? v : +v));
      data.mode = `${data.mode}-${data.rsiMode}`;
      delete data.rsiMode;
      if (bots[data.pair]) method = "PUT";
      const newBot = await request("/api/bots", {
        headers: { "Content-Type": "application/json" },
        method,
        body: JSON.stringify(data),
      });
      setBots({ ...bots, ...newBot });
      close();
    } catch (error) {
      alert(JSON.stringify(error.message || error.error || error));
    }
    setLoading(false);
  };

  const sellAllOrders = async (pair) => {
    if (!confirm(`Are you sure want to sell all the order for "${pair}" currency?`)) return;
    setLoading(true);
    try {
      await request(`/api/bots/orders?pair=${pair}`, { method: "PUT" });
    } catch (error) {
      alert(JSON.stringify(error.message || error.error || error));
    }
    setLoading(false);
  };

  const remove = async (pair) => {
    if (!confirm("Do you want to delete Bot?")) return;
    setLoading(true);
    request(`/api/bots?pair=${pair}`, { method: "DELETE" })
      .then(() => {
        const copy = { ...bots };
        delete copy[pair];
        setBots(copy);
        setLoading(false);
      })
      .catch(catchErr);
  };

  const handleActions = async (action, pair) => {
    if (action == "edit") setBotToUpdate({ pair, info: bots[pair] });
    else if (action == "delete") remove(pair);
    else if (action == "sell-all") sellAllOrders(pair);
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

  const signOut = async () => {
    request("/api/auth", { method: "DELETE" })
      .then(() => router.replace("/signin"))
      .catch(catchErr);
  };

  const fetchBots = async () => {
    setLoading(true);
    await request("/api/bots")
      .then((data) => {
        setBalance(data.balance + 0);
        delete data.balance;
        setBots(data);
      })
      .catch(console.log);
    setLoading(false);
  };

  useEffect(() => {
    request("/api/auth")
      .then(fetchBots)
      .catch(() => router.replace("/signin"));
  }, []);

  return (
    <>
      <header className="no-select flex px-3 sm:px-5 py-6 mb-8 border-b-[1px] border-neutral-300 dark:border-neutral-600 items-center justify-between">
        <strong className="text-3xl font-bold text-emerald-500">€{parseInt(balance)}</strong>
        <div className="flex text-white">
          <button
            onClick={() => handleActions("turn-off-all", "all")}
            className={`${btnCls.replace("bg-pc", "bg-rose-400")} !w-auto !py-0 !px-[4px] mr-3`}
          >
            Stop all
          </button>
          <button
            onClick={() => handleActions("turn-on-all", "all")}
            className={`${btnCls.replace("bg-pc", "bg-emerald-400")} !w-auto !py-0 !px-[4px]`}
          >
            Run all
          </button>
        </div>
        <div className="flex items-end">
          <strong>
            <span className="text-green">{botsPairs.filter((p) => bots[p].startedOn).length}</span>
            <span className="mx-1 ">/</span>
            {botsPairs.length}
          </strong>
          <button
            onClick={() => setShowAddBotForm(true)}
            className={`${btnCls} !w-8 !h-8 ml-3 p-1 flex items-center justify-center rounded-3xl`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/add-bot-icon.png" alt="Add bot icon" priority className="w-full" />
          </button>
        </div>
      </header>

      <main className="no-select px-3 sm:px-5 py-6 mb-8 max-w-2xl mx-auto">
        <div className="flex no-srl-bar">
          <span className="flex-1 w-1/5 font-medium">Crypto</span>
          <span className="flex-1 w-1/5 font-medium">Capital</span>
          <p className="relative flex-1 w-1/5">
            <span className={`${badgeCls} bg-emerald-400`}>
              {parseInt(Object.keys(bots).reduce((acc, p) => acc + bots[p].earnings, 0))}
            </span>
            <span className="block font-medium">Earings</span>
          </p>
          <p className="relative flex-2 w-2/5">
            <span className={`${badgeCls} bg-rose-300`}>
              {Object.keys(bots).reduce((acc, p) => acc + bots[p].orders.length, 0)}
            </span>
            <span className="block font-medium">Orders</span>
          </p>
        </div>

        <ul className="pt-4">
          {Object.keys(bots)
            // .sort((p1, p2) => Date.parse(bots[p1].createTime) - Date.parse(bots[p2].createTime))
            .sort((p1, p2) => bots[p2].earnings - bots[p1].earnings)
            .map((pair) => (
              <BotItem botInfo={{ pair, ...bots[pair] }} onAction={handleActions} key={pair} />
            ))}
        </ul>
      </main>

      <Modal
        title={`${"" ? "Add new" : "Update"} trading bot`}
        open={showAddBotForm || !!botToUpdate}
        loading={loading}
        onCancel={close}
      >
        <AddBotFrom bot={botToUpdate} onSubmit={add} />
      </Modal>

      <button
        className="no-select fixed bottom-8 left-8 w-8 h-8 default-bg rounded-md shadow-[0px_1px_9px_1px_rgba(0,0,0,0.25)]"
        onClick={signOut}
      >
        <svg fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="m2 12 5 4v-3h9v-2H7V8z" />
          <path d="M13.001 2.999a8.938 8.938 0 0 0-6.364 2.637L8.051 7.05c1.322-1.322 3.08-2.051 4.95-2.051s3.628.729 4.95 2.051 2.051 3.08 2.051 4.95-.729 3.628-2.051 4.95-3.08 2.051-4.95 2.051-3.628-.729-4.95-2.051l-1.414 1.414c1.699 1.7 3.959 2.637 6.364 2.637s4.665-.937 6.364-2.637c1.7-1.699 2.637-3.959 2.637-6.364s-.937-4.665-2.637-6.364a8.938 8.938 0 0 0-6.364-2.637z" />
        </svg>
      </button>

      <RefreshButton onClick={fetchBots} />

      <Loader loading={loading} />
    </>
  );
}

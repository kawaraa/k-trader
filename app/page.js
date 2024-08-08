"use client";
import { useEffect, useRef, useState } from "react";
import BotItem from "./components/bot-item";
import { Modal } from "./components/modal";
import AddBotFrom from "./components/add-bot-form";
import { useRouter } from "next/navigation";
import { dateToString, request } from "../src/utilities";
import { btnCls } from "./components/tailwind-classes";
import Loader from "./components/loader";
import RefreshButton from "./components/refresh-button";

export default function Home() {
  const renderRef = useRef(null);
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState(0);
  const [bots, setBots] = useState({});
  const [botToUpdate, setBotToUpdate] = useState(null);
  const [showAddBotForm, setShowAddBotForm] = useState(false);
  const close = () => setShowAddBotForm(false) + setBotToUpdate(null);
  const catchErr = (er) => alert(er.message || er.error || er);

  const add = async (e) => {
    e.preventDefault();
    setLoading(true);
    const data = {};
    let method = "POST";
    try {
      new FormData(e.target).forEach((v, k) => (data[k] = k == "pair" ? v : +v));
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
    else if (action == "turn-on" || action == "turn-off") {
      if (action == "turn-on" && !confirm(`Do you run "${pair}" Bot?`)) return;
      setLoading(true);
      const url = `/api/bots?pair=${pair}&status=${action.replace("turn-", "")}`;
      await request(url, { method: "PATCH" }).catch(catchErr);
      const startedOn = action == "turn-off" ? null : dateToString();
      const copy = { ...bots };
      copy[pair].startedOn = startedOn;
      setBots(copy);
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
    request("/api/auth").catch(() => router.replace("/signin"));
    if (!renderRef.current) fetchBots();
    renderRef.current = true;
  }, []);

  return (
    <>
      <header className="flex px-3 md:px-5 py-6 mb-8 border-b-[1px] border-neutral-300 dark:border-neutral-600 items-center justify-between">
        <strong className="text-3xl font-bold text-emerald-500">€{balance}</strong>
        <div className="flex items-end">
          <strong>{Object.keys(bots).length}</strong>
          <button
            onClick={() => setShowAddBotForm(true)}
            className={`${btnCls} !w-8 !h-8 ml-3 p-1 flex items-center justify-center rounded-3xl`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/add-bot-icon.png" alt="Add bot icon" priority className="w-full" />
          </button>
        </div>
      </header>
      <main className="px-3 md:px-5 py-6 mb-8 max-w-2xl mx-auto">
        <p className="flex overflow-y-auto no-srl-bar">
          <span className="flex-1 w-1/5">Crypto</span>
          <span className="flex-1 w-1/5">Capital</span>
          <span className="flex-1 w-1/5">Earings</span>
          <span className="flex-1 w-2/5">Orders</span>
        </p>

        <ul className="pt-5">
          {Object.keys(bots)
            .sort((p1, p2) => Date.parse(bots[p1].createTime) - Date.parse(bots[p2].createTime))
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
        className="fixed bottom-8 left-8 w-8 h-8 default-bg rounded-md shadow-[0px_1px_9px_1px_rgba(0,0,0,0.25)]"
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

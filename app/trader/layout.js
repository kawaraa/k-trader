"use client";
import { Suspense, useEffect, useState } from "react";
import { btnCls, inputCls } from "../components/tailwind-classes";
import PageHeader from "../components/page-header";

export default function RootLayout({ children }) {
  const [selectedAsset, setSelectedAsset] = useState("ALL");
  const balance = 0;

  useEffect(() => {
    balance = 0;
  }, []);
  return (
    <>
      <PageHeader pair={"pair"} />

      <header className="no-select flex px-3 sm:px-5 py-6 border-b-[1px] border-neutral-300 dark:border-neutral-600 items-center justify-between">
        <strong className="text-3xl font-bold text-emerald-500">€{parseInt(balance)}</strong>
        <div className="flex text-white">
          <button
            onClick={() => handleActions("turn-off-all", "all")}
            className={`${btnCls.replace("bg-pc", "bg-rose-400")} !w-auto !py-0 !px-[4px] mr-3`}
          >
            Stop
          </button>
          <button
            onClick={() => handleActions("turn-on-all", "all")}
            className={`${btnCls.replace("bg-pc", "bg-emerald-400")} !w-auto !py-0 !px-[4px]`}
          >
            Run
          </button>
        </div>
        <div className="flex items-end">
          <strong>
            <span className="text-green">{0}</span>
            <span className="mx-1 ">/</span>
            {390}
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

      <div className="flex justify-between">
        {/* <ToggleSwitch onChange={handleNotificationSettings} checked={notificationOn}>
          <span className="mx-3">Notify me</span>
        </ToggleSwitch> */}

        <select name="pair" defaultValue={"bot?.pair"} required className={inputCls}>
          <option value="ALL">ALL</option>
          {[].map((pair) => (
            <option value={pair} key={pair}>
              {pair.replace("EUR", "")}
            </option>
          ))}
        </select>

        <label for="orderby" className="flex items-center m-2 cursor-pointer">
          <input
            id="orderby"
            type="checkbox"
            value="orderby"
            name="orderby"
            className="w-4 h-4"
            onChange={(e) => setOrderbyTime(e.target.checked)}
          />
          <span className="ml-1">Orderby time</span>
        </label>
      </div>

      <main className="no-select px-3 sm:px-5 py-6 mb-8">
        <Suspense>{children}</Suspense>
      </main>
    </>
  );
}

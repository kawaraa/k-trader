"use client";
import Link from "next/link";
import { useState } from "react";
import { borderCls } from "./tailwind-classes";
const sum = (arr) => arr.reduce((acc, num) => acc + num, 0);

export default function BotItem({ botInfo, onAction }) {
  const [open, setOpen] = useState(false);
  const cls = open ? "max-h-[1000px] py-2 mt-2 border-t-[1px] border-slate-200" : "max-h-[0px]";
  const status = botInfo.startedOn ? "off" : "on";
  const btnCls = "text-white rounded-md py-1 px-2 bg-amber-500"; // bg-pc
  const age = ((Date.now() - Date.parse(botInfo.createTime)) / (60000 * 60 * 24)).toFixed(1);

  return (
    <li className={`mb-3 p-2 overflow-y-auto no-srl-bar card rounded-md ${borderCls}`}>
      <div className="flex">
        <span className="flex-1 w-1/5">{botInfo.pair.replace("EUR", "")}</span>
        <span className="flex-1 w-1/5 text-orange">€{botInfo.capital}</span>
        <div className="flex-1 w-1/5">
          <button onClick={() => onAction("rest", botInfo.pair)} className="text-green">
            €{parseInt(sum(botInfo.trades))}
          </button>
        </div>
        <span className="flex-2 w-2/5 flex justify-between items-center">
          <span className="flex-auto text-red">{botInfo.position ? 1 : 0}</span>
          <button
            onClick={() => onAction(`turn-${status}`, botInfo.pair)}
            className={`rounded-xl inline-flex aspect-square w-3.5 ml-2 mr-5 ${
              !botInfo.startedOn ? "bg-blur dark:bg-slate-300" : "bg-emerald-400"
            }`}
          ></button>
          <button
            onClick={() => setOpen(!open)}
            className={`h-6 w-6 -rotate-180 ${!open && "rotate-0"} duration-300`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              className="pointer-events-none w-full"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </span>
      </div>

      <div className={`flex flex-col overflow-hidden px-2 transition-all duration-300 ease-in-out ${cls}`}>
        <div className="flex flex-col mb-5">
          <p className="mt-1">
            <strong>Timeinterval</strong>: <span>{botInfo.interval} mins</span>
          </p>
          <p className="">
            <strong>Trader</strong>: <span>{botInfo.trader}</span>
          </p>
          <p className="">
            <strong>Mode</strong>: <span>{botInfo.mode}</span>
          </p>
          <p className="">
            <strong>Created</strong>: <span>{age} days ago</span>
          </p>
          <p className="">
            <strong>Trades</strong>: <span>{botInfo.trades.length}</span>
          </p>

          <div className="flex items-center">
            <strong>Prices charts</strong>:
            <p className="ml-2 text-pc font-semi-bold">
              <Link href={`/chart?pair=${botInfo.pair}`} className="underline underline-offset-4 mr-3">
                Stored
              </Link>
              <Link
                href={`https://pro.kraken.com/app/trade/${botInfo.pair
                  ?.replace("EUR", "")
                  .toLowerCase()}-eur`}
                target="_blank"
                referrerPolicy="no-referrer"
                className="underline underline-offset-4"
              >
                Live
              </Link>
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <button onClick={() => onAction("delete", botInfo.pair)} className="w-8 flex text-red">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="64 64 896 896"
              className="pointer-events-none w-full"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M360 184h-8c4.4 0 8-3.6 8-8v8h304v-8c0 4.4 3.6 8 8 8h-8v72h72v-80c0-35.3-28.7-64-64-64H352c-35.3 0-64 28.7-64 64v80h72v-72zm504 72H160c-17.7 0-32 14.3-32 32v32c0 4.4 3.6 8 8 8h60.4l24.7 523c1.6 34.1 29.8 61 63.9 61h454c34.2 0 62.3-26.8 63.9-61l24.7-523H888c4.4 0 8-3.6 8-8v-32c0-17.7-14.3-32-32-32zM731.3 840H292.7l-24.2-512h487l-24.2 512z"></path>
            </svg>
          </button>
          <button onClick={() => onAction("edit", botInfo.pair)} className="w-8 h-8 flex text-pc">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              className="p-1 pointer-events-none w-full"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
            </svg>
          </button>

          <Link href={`/bot?pair=${botInfo.pair}`} className="w-8 h-8 flex text-pc">
            <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="none">
              <g fill="currentColor">
                <path d="M5.314 1.256a.75.75 0 01-.07 1.058L3.889 3.5l1.355 1.186a.75.75 0 11-.988 1.128l-2-1.75a.75.75 0 010-1.128l2-1.75a.75.75 0 011.058.07zM7.186 1.256a.75.75 0 00.07 1.058L8.611 3.5 7.256 4.686a.75.75 0 10.988 1.128l2-1.75a.75.75 0 000-1.128l-2-1.75a.75.75 0 00-1.058.07zM2.75 7.5a.75.75 0 000 1.5h10.5a.75.75 0 000-1.5H2.75zM2 11.25a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75zM2.75 13.5a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5z"></path>
              </g>
            </svg>
          </Link>
          <button onClick={() => onAction("sell-all", botInfo.pair)} className={btnCls}>
            Sell all
          </button>
        </div>
      </div>
    </li>
  );
}

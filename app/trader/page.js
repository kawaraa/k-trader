"use client";
import { useEffect, useRef, useState } from "react";
// import { useRouter, useSearchParams } from "next/navigation";
// import RefreshButton from "../components/refresh-button";
import Loader from "../components/loader";
import { request } from "../../shared-code/utilities.js";

export default function Assets() {
  const watchedAssets = [{}];
  const loading = false;

  useEffect(() => {
    // request()
    // balance = 0;
  }, []);
  return (
    <>
      <div className="flex flex-col h-screen"></div>
      <ul className="pt-4"></ul>

      {/* <RefreshButton onClick={fetchLogContent} /> */}

      <Loader loading={loading} />
    </>
  );
}

"use client";
// import { useEffect, useRef, useState } from "react";
// import { request } from "../../src/utilities.js";
// import { useRouter, useSearchParams } from "next/navigation";
// import RefreshButton from "../components/refresh-button";
import Loader from "../components/loader";
// import PageHeader from "../components/page-header";

export default function Assets() {
  const watchedAssets = [{}];

  return (
    <>
      <div className="flex flex-col h-screen"></div>
      <ul className="pt-4"></ul>

      {/* <RefreshButton onClick={fetchLogContent} /> */}

      <Loader loading={loading} />
    </>
  );
}

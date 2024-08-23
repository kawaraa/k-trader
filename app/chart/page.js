"use client";
import { useEffect, useRef, useState } from "react";
import { request } from "../../src/utilities";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Loader from "../components/loader";

export default function Bot() {
  const searchParams = useSearchParams();
  const pair = searchParams.get("pair");

  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // const fetchLogContent = async () => {
  //   setLoading(true);
  //   logsRef.current.innerText = await request(`/api/bots/logs?pair=${pair}`).catch((err) => err.message);
  //   logsRef.current?.scroll({ top: logsRef.current?.scrollHeight, behavior: "smooth" });
  //   setLoading(false);
  // };

  // useEffect(() => {
  //   request("/api/auth")
  //     .catch(() => router.replace("/signin"))
  //     .then(fetchLogContent());
  // }, []);

  return (
    <>
      <main className="flex flex-col h-screen m-0 p-0">
        <header className="flex px-3 md:px-5 py-4 mb-6 border-b-[1px] border-neutral-300 dark:border-neutral-600 items-end">
          <Link href="/" className="w-12 h-12 ml-2 p-1 flex items-center justify-center rounded-3xl">
            <svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
              <path d="M224 480h640a32 32 0 1 1 0 64H224a32 32 0 0 1 0-64z" />
              <path d="m237.248 512 265.408 265.344a32 32 0 0 1-45.312 45.312l-288-288a32 32 0 0 1 0-45.312l288-288a32 32 0 1 1 45.312 45.312L237.248 512z" />
            </svg>
          </Link>

          <h1 class="mx-auto text-2xl md:text-3xl font-bold">✨ {pair.replace("EUR", "")} / EUR ✨</h1>
        </header>

        <div className="">
          <div id="select-wrapper">
            <select name="pair" onchange="getPricesData(this.value)">
              {/* <!-- class 1 --> */}

              <option value="BTCEUR">BTCEUR</option>
              <option value="ETHEUR">ETHEUR</option>
              <option value="1INCHEUR">1INCHEUR</option>
              <option value="AAVEEUR">AAVEEUR</option>
              <option value="ADAEUR">ADAEUR</option>
              <option value="ALGOEUR">ALGOEUR</option>
              <option value="API3EUR">API3EUR</option>
              <option value="APTEUR">APTEUR</option>
              <option value="ARBEUR">ARBEUR</option>
              <option value="ARKMEUR">ARKMEUR</option>
              <option value="ATLASEUR">ATLASEUR</option>
              <option value="ATOMEUR">ATOMEUR</option>
              <option value="AXSEUR">AXSEUR</option>
              <option value="BADGEREUR">BADGEREUR</option>
              <option value="BALEUR">BALEUR</option>
              <option value="BANDEUR">BANDEUR</option>
              <option value="BATEUR">BATEUR</option>
              <option value="BCHEUR">BCHEUR</option>
              <option value="BLUREUR">BLUREUR</option>
              <option value="BLZEUR">BLZEUR</option>
              <option value="BNTEUR">BNTEUR</option>
              <option value="BODENEUR">BODENEUR</option>
              <option value="BONKEUR">BONKEUR</option>
              <option value="CELREUR">CELREUR</option>
              <option value="COMPEUR">COMPEUR</option>
              <option value="COTIEUR">COTIEUR</option>
              <option value="CRVEUR">CRVEUR</option>
              <option value="CTSIEUR">CTSIEUR</option>
              <option value="DAIEUR">DAIEUR</option>
              <option value="DASHEUR">DASHEUR</option>
              <option value="DENTEUR">DENTEUR</option>
              <option value="DOTEUR">DOTEUR</option>
              <option value="DYDXEUR">DYDXEUR</option>
              <option value="DYMEUR">DYMEUR</option>
              <option value="EGLDEUR">EGLDEUR</option>
              <option value="ENAEUR">ENAEUR</option>
              <option value="ENJEUR">ENJEUR</option>
              <option value="ENSEUR">ENSEUR</option>
              <option value="EOSEUR">EOSEUR</option>
              <option value="ETCEUR">ETCEUR</option>
              <option value="ETHWEUR">ETHWEUR</option>
              <option value="EWTEUR">EWTEUR</option>
              <option value="FETEUR">FETEUR</option>
              <option value="FIDAEUR">FIDAEUR</option>
              <option value="FILEUR">FILEUR</option>
              <option value="FLOWEUR">FLOWEUR</option>
              <option value="FLREUR">FLREUR</option>
              <option value="FTMEUR">FTMEUR</option>
              <option value="FXSEUR">FXSEUR</option>
              <option value="GALAEUR">GALAEUR</option>
              <option value="GLMREUR">GLMREUR</option>
              <option value="GMTEUR">GMTEUR</option>
              <option value="GMXEUR">GMXEUR</option>
              <option value="GRTEUR">GRTEUR</option>
              <option value="GSTEUR">GSTEUR</option>
              <option value="GTCEUR">GTCEUR</option>
              <option value="HFTEUR">HFTEUR</option>
              <option value="HONEYEUR">HONEYEUR</option>
              <option value="ICPEUR">ICPEUR</option>
              <option value="ICXEUR">ICXEUR</option>
              <option value="IMXEUR">IMXEUR</option>
              <option value="INJEUR">INJEUR</option>
              <option value="JASMYEUR">JASMYEUR</option>
              <option value="JUPEUR">JUPEUR</option>
              <option value="KAVAEUR">KAVAEUR</option>
              <option value="KEYEUR">KEYEUR</option>
              <option value="KNCEUR">KNCEUR</option>
              <option value="KP3REUR">KP3REUR</option>
              <option value="KSMEUR">KSMEUR</option>
              <option value="LDOEUR">LDOEUR</option>
              <option value="LINKEUR">LINKEUR</option>
              <option value="LMWREUR">LMWREUR</option>
              <option value="LPTEUR">LPTEUR</option>
              <option value="LTCEUR">LTCEUR</option>
              <option value="LUNA2EUR">LUNA2EUR</option>
              <option value="MANAEUR">MANAEUR</option>
              <option value="MASKEUR">MASKEUR</option>
              <option value="MATICEUR">MATICEUR</option>
              <option value="MCEUR">MCEUR</option>
              <option value="MINAEUR">MINAEUR</option>
              <option value="MKREUR">MKREUR</option>
              <option value="MNTEUR">MNTEUR</option>
              <option value="MOVREUR">MOVREUR</option>
              <option value="NANOEUR">NANOEUR</option>
              <option value="NEAREUR">NEAREUR</option>
              <option value="OMGEUR">OMGEUR</option>
              <option value="OXTEUR">OXTEUR</option>
              <option value="PERPEUR">PERPEUR</option>
              <option value="QNTEUR">QNTEUR</option>
              <option value="QTUMEUR">QTUMEUR</option>
              <option value="RAREEUR">RAREEUR</option>
              <option value="RARIEUR">RARIEUR</option>
              <option value="RAYEUR">RAYEUR</option>
              <option value="RENEUR">RENEUR</option>
              <option value="REQEUR">REQEUR</option>
              <option value="RUNEEUR">RUNEEUR</option>
              <option value="SANDEUR">SANDEUR</option>
              <option value="SCRTEUR">SCRTEUR</option>
              <option value="SEIEUR">SEIEUR</option>
              <option value="SGBEUR">SGBEUR</option>
              <option value="SHIBEUR">SHIBEUR</option>
              <option value="SNXEUR">SNXEUR</option>
              <option value="SOLEUR">SOLEUR</option>
              <option value="SPELLEUR">SPELLEUR</option>
              <option value="STORJEUR">STORJEUR</option>
              <option value="STRKEUR">STRKEUR</option>
              <option value="STXEUR">STXEUR</option>
              <option value="SUPEREUR">SUPEREUR</option>
              <option value="SUSHIEUR">SUSHIEUR</option>
              <option value="TLMEUR">TLMEUR</option>
              <option value="TRUEUR">TRUEUR</option>
              <option value="TRXEUR">TRXEUR</option>
              <option value="TVKEUR">TVKEUR</option>
              <option value="UNFIEUR">UNFIEUR</option>
              <option value="UNIEUR">UNIEUR</option>
              <option value="USDCEUR">USDCEUR</option>
              <option value="USDTEUR">USDTEUR</option>
              <option value="WIFEUR">WIFEUR</option>
              <option value="WOOEUR">WOOEUR</option>
              <option value="XDGEUR">XDGEUR</option>
              <option value="ETCEUR">ETCEUR</option>
              <option value="XLMEUR">XLMEUR</option>
              <option value="XRPEUR">XRPEUR</option>
              <option value="XTZEUR">XTZEUR</option>
              <option value="XMREUR">XMREUR</option>
              <option value="ZECEUR">ZECEUR</option>
              <option value="YFIEUR">YFIEUR</option>
              <option value="YGGEUR">YGGEUR</option>
              <option value="ZECEUR">ZECEUR</option>
              <option value="ZETAEUR">ZETAEUR</option>
              <option value="ZROEUR">ZROEUR</option>
              <option value="ZRXEUR">ZRXEUR</option>

              {/* <!-- Class 2 --> */}

              <option value="OCEANEUR">OCEANEUR</option>
              <option value="PENDLEEUR">PENDLEEUR</option>
              <option value="ETHFIEUR">ETHFIEUR</option>
              <option value="C98EUR">C98EUR</option>
              <option value="CFGEUR">CFGEUR</option>
              <option value="BOBAEUR">BOBAEUR</option>
              <option value="WBTCEUR">WBTCEUR</option>
              <option value="CVXEUR">CVXEUR</option>
              <option value="STEPEUR">STEPEUR</option>
              <option value="RLCEUR">RLCEUR</option>
              <option value="MOONEUR">MOONEUR</option>
              <option value="LUNAEUR">LUNAEUR</option>
              <option value="GHSTEUR">GHSTEUR</option>
              <option value="GARIEUR">GARIEUR</option>
              <option value="FLOKIEUR">FLOKIEUR</option>
              <option value="BTTEUR">BTTEUR</option>
              <option value="BSXEUR">BSXEUR</option>
              <option value="ALPHAEUR">ALPHAEUR</option>
              <option value="BONDEUR">BONDEUR</option>
              <option value="HDXEUR">HDXEUR</option>
              <option value="HNTEUR">HNTEUR</option>
              <option value="LCXEUR">LCXEUR</option>
              <option value="LSKEUR">LSKEUR</option>
              <option value="NYMEUR">NYMEUR</option>
              <option value="ORCAEUR">ORCAEUR</option>
              <option value="PAXGEUR">PAXGEUR</option>
              <option value="PHAEUR">PHAEUR</option>
              <option value="REPV2EUR">REPV2EUR</option>
              <option value="SAMOEUR">SAMOEUR</option>
              <option value="SBREUR">SBREUR</option>
              <option value="TEEREUR">TEEREUR</option>
              <option value="WENEUR">WENEUR</option>
              <option value="MLNEUR">MLNEUR</option>
              <option value="AGLDEUR">AGLDEUR</option>

              {/* <!-- class 3 --> */}

              <option value="ACAEUR">ACAEUR</option>
              <option value="ADXEUR">ADXEUR</option>
              <option value="AKTEUR">AKTEUR</option>
              <option value="ALICEEUR">ALICEEUR</option>
              <option value="ALTEUR">ALTEUR</option>
              <option value="ANTEUR">ANTEUR</option>
              <option value="ARPAEUR">ARPAEUR</option>
              <option value="AUDIOEUR">AUDIOEUR</option>
              <option value="BEAMEUR">BEAMEUR</option>
              <option value="BICOEUR">BICOEUR</option>
              <option value="BIGTIMEEUR">BIGTIMEEUR</option>
              <option value="BNCEUR">BNCEUR</option>
              <option value="BRICKEUR">BRICKEUR</option>
              <option value="CHREUR">CHREUR</option>
              <option value="CHZEUR">CHZEUR</option>
              <option value="CSMEUR">CSMEUR</option>
              <option value="EULEUR">EULEUR</option>
              <option value="EURTEUR">EURTEUR</option>
              <option value="FARMEUR">FARMEUR</option>
              <option value="FISEUR">FISEUR</option>
              <option value="FORTHEUR">FORTHEUR</option>
              <option value="GALEUR">GALEUR</option>
              <option value="IDEXEUR">IDEXEUR</option>
              <option value="INTREUR">INTREUR</option>
              <option value="JUNOEUR">JUNOEUR</option>
              <option value="KAREUR">KAREUR</option>
              <option value="KEEPEUR">KEEPEUR</option>
              <option value="KINEUR">KINEUR</option>
              <option value="KINTEUR">KINTEUR</option>
              <option value="KUJIEUR">KUJIEUR</option>
              <option value="MIREUR">MIREUR</option>
              <option value="MNGOEUR">MNGOEUR</option>
              <option value="MPLEUR">MPLEUR</option>
              <option value="MSOLEUR">MSOLEUR</option>
              <option value="MULTIEUR">MULTIEUR</option>
              <option value="OSMOEUR">OSMOEUR</option>
              <option value="OXYEUR">OXYEUR</option>
              <option value="PSTAKEEUR">PSTAKEEUR</option>
              <option value="REPEUR">REPEUR</option>
              <option value="SRMEUR">SRMEUR</option>
              <option value="STGEUR">STGEUR</option>
              <option value="TUSDEUR">TUSDEUR</option>
              <option value="WAXLEUR">WAXLEUR</option>
            </select>
          </div>
          <canvas id="cavnas-chart-holder" width="400" height="200"></canvas>

          {/* <script>
      const profit = (ask, bid, amt = 9) => (amt / ask) * bid * 0.992;
      const percentage = (cur, past) => `${(((cur - past) / (past || 0)) * 100).toFixed(2)}%`;

      //
      const ctx = document.getElementById("cavnas-chart-holder").getContext("2d");
      // const pair = window.location.search.split("=")[1];

      async function getPricesData(pair) {
        const data = await request(`http://localhost:3000/${pair}.json`);

        if (window.chartInstance) window.chartInstance.destroy();

        window.chartInstance = new Chart(ctx, {
          type: "line",
          data: {
            labels: data.map((_, i) => (i * 5 < 60 ? i * 5 : ((i * 5) / 60).toFixed(2))), // Time labels
            datasets: [
              {
                label: "Ask Price",
                borderColor: "rgba(255, 0, 0, 1)",
                backgroundColor: "rgba(255, 0, 0, 0.2)",
                fill: false,
                data: data.map((d) => d.askPrice),
              },
              {
                label: "Trade Price",
                borderColor: "rgba(0, 128, 0, 1)",
                backgroundColor: "rgba(0, 128, 0, 0.2)",
                fill: false,
                data: data.map((d) => d.tradePrice),
                hidden: true,
              },
              {
                label: "Bid Price",
                borderColor: "rgba(0, 0, 255, 1)",
                backgroundColor: "rgba(0, 0, 255, 0.2)",
                fill: false,
                data: data.map((d) => d.bidPrice),
              },
            ],
          },
          options: {
            responsive: true,
          },
        });
      }
      getPricesData(document.querySelector("select").options[0].value);

      function request(url) {
        return fetch(url).then(async (response) => {
          if (!response.ok) {
            const data = await response.text();
            throw new Error(`HTTP error! Status: ${response.status} ${data}`);
          }
          return response.json();
        });
      }
    </script> */}
        </div>
      </main>

      {/* <Loader loading={loading} /> */}
    </>
  );
}

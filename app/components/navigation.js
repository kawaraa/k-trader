"use client";
import { State } from "../state";
import { ToggleSwitch } from "./inputs";
import { btnCls } from "./tailwind-classes";
import { urlBase64ToUint8Array } from "../services/encoding-helper";
const key = process.env.NEXT_PUBLIC_VAPID_KEY;

export default function Navigation(props) {
  const { balance, traders, notificationOn, setNotificationOn } = State();
  const pairs = Object.keys(traders);

  const setDefaultCapital = (e) => {
    console.log(e.target.value);
  };

  const handleNotificationSettings = async (e) => {
    try {
      await Notification.requestPermission();
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key), // From `web-push generate-vapid-keys`
      });

      if (!e.target.checked) {
        // console.log("Push subscription:", subscription);
        // Send subscription to your backend (for testing, log it)
        await fetch("/api/notification", {
          method: "POST",
          body: JSON.stringify(subscription),
          headers: { "Content-Type": "application/json" },
        }).then((res) => res.json());
        setNotificationOn(true);
      } else {
        await fetch(`/api/notification?endpoint=${subscription.endpoint}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
        }).then((res) => res.json());
        setNotificationOn(false);
      }
    } catch (error) {
      console.log("requestPushNotification: ", error);
    }
  };

  return (
    // <header className="relative min-h-14">
    //   <nav className="z-[7] fixed w-full flex h-14 px-1 sm:px-2 md:px-4 top-0 card border no-select">
    //  <PageHeader pair={pair} />

    <header className="no-select flex px-3 sm:px-5 py-6 border-b-[1px] border-neutral-300 dark:border-neutral-600 items-center justify-between">
      {/* <nav className="z-[7] fixed w-full flex h-14 px-1 sm:px-2 md:px-4 top-0 card border no-select"></nav> */}
      <strong className="text-3xl font-bold text-emerald-500">€{parseInt(balance)}</strong>

      <div className="flex text-white">
        <div>
          <label htmlFor="default-capital-input-id">Default Capital</label>
          <input type="number" onBlur={setDefaultCapital} id="default-capital-input-id" />
        </div>

        <div className="flex justify-between">
          <ToggleSwitch onChange={handleNotificationSettings} checked={notificationOn}>
            <span className="mx-3">Notify me</span>
          </ToggleSwitch>
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
      </div>

      <div className="flex items-end">
        <strong>
          <span className="text-green">{pairs.length}</span>
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
  );
}

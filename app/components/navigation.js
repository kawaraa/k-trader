"use client";
import { State } from "../state";
import { ToggleSwitch } from "./inputs";
import { urlBase64ToUint8Array } from "../services/encoding-helper";
const key = process.env.NEXT_PUBLIC_VAPID_KEY;

export default function Navigation(props) {
  const { eurBalance, traders, loadedTraders, notificationOn, setNotificationOn } = State();
  const pairs = Object.keys(traders);
  const loadedPairs = Object.keys(loadedTraders);

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
    <header className="no-select flex px-1 sm:px-3 py-3 border-b-[1px] border-neutral-300 dark:border-neutral-600 items-center justify-between">
      {/* <header className="relative min-h-14"> */}
      {/* <nav className="z-[7] fixed w-full flex h-14 px-1 sm:px-2 md:px-4 top-0 card border no-select"> */}
      {/* <PageHeader pair={pair} /> */}
      {/* <nav className="z-[7] fixed w-full flex h-14 px-1 sm:px-2 md:px-4 top-0 card border no-select"></nav> */}
      <div className="flex-auto">
        <strong className="text-2xl font-bold text-emerald-500">€{parseInt(eurBalance)}</strong>
      </div>
      <ToggleSwitch onChange={handleNotificationSettings} checked={notificationOn} cls="mr-3">
        <span className="mx-3">Notify me</span>
      </ToggleSwitch>

      <div className="flex items-center items-end">
        <strong>
          {loadedPairs.length}/<span className="text-green">{pairs.length}</span>
        </strong>
        <span className={`w-6 ml-1 flex rounded-3xl`}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 6h8a3 3 0 0 1 0 6a3 3 0 0 1 0 6h-8" />
            <path d="M8 6l0 12" />
            <path d="M8 12l6 0" />
            <path d="M9 3l0 3" />
            <path d="M13 3l0 3" />
            <path d="M9 18l0 3" />
            <path d="M13 18l0 3" />
          </svg>
        </span>
      </div>
    </header>
  );
}

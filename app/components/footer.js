"use client";
// import { useRouter } from "next/navigation";
import RefreshButton from "./refresh-button";
import { request } from "../../shared-code/utilities.js";

export default function Footer(props) {
  // const router = useRouter();
  const catchErr = (er) => alert(er.message || er.error || er);

  const logout = async () => {
    request("/api/auth")
      .then(() => window.location.reload())
      .catch(catchErr);
  };

  return (
    <footer className="flex justify-center">
      <button
        className="no-select fixed bottom-8 left-8 w-8 h-8 default-bg rounded-md shadow-[0px_1px_9px_1px_rgba(0,0,0,0.25)]"
        onClick={logout}
      >
        <svg fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="m2 12 5 4v-3h9v-2H7V8z" />
          <path d="M13.001 2.999a8.938 8.938 0 0 0-6.364 2.637L8.051 7.05c1.322-1.322 3.08-2.051 4.95-2.051s3.628.729 4.95 2.051 2.051 3.08 2.051 4.95-.729 3.628-2.051 4.95-3.08 2.051-4.95 2.051-3.628-.729-4.95-2.051l-1.414 1.414c1.699 1.7 3.959 2.637 6.364 2.637s4.665-.937 6.364-2.637c1.7-1.699 2.637-3.959 2.637-6.364s-.937-4.665-2.637-6.364a8.938 8.938 0 0 0-6.364-2.637z" />
        </svg>
      </button>

      <RefreshButton onClick={() => window.location.reload()} />
    </footer>
  );
}

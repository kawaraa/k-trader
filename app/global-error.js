"use client"; // Error boundaries must be Client Components

export default function GlobalError({ error, reset }) {
  return (
    // global-error must include html and body tags
    <html>
      <body className="w-full h-screen flex flex-col items-center justify-center">
        <article dir="auto" className="mx-auto my-4 flex max-w-xl flex-col rounded-lg border p-8 md:p-12">
          Something went wrong
          <h2 className="text-xl font-bold"></h2>
          <p className="my-2">Please try again!</p>
          <button
            className="button mx-auto mt-4 flex w-full items-center justify-center ml-3 px-3 py-1 text-sm rounded-md lg:px-4 lg:py-2"
            onClick={() => reset()}
          >
            Go back
          </button>
        </article>
      </body>
    </html>
  );
}

// app/login/error.tsx
// 'use client'
// export default function Error({ error, reset }) {
//   if (error.message.includes('Failed to fetch')) {
//     return (
//       <div>
//         <h2>Offline Detected</h2>
//         <p>You appear to be offline.</p>
//       </div>
//     )
//   }

//   // ... rest of your error handling
// }

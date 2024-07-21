async function waitForApiLimit(lastApiCall, lastApiCall) {
  let elapsedTime = (Date.now() - lastApiCall) / 1000;
  apiCounter += elapsedTime * 0.33; // Increment counter based on elapsed time
  apiCounter = Math.min(apiCounter, 15); // Cap the counter at 15
  while (apiCounter < 1) {
    // Ensure at least one API call is available
    await new Promise((resolve) => setTimeout(resolve, 1000));
    elapsedTime = (Date.now() - lastApiCall) / 1000;
    apiCounter += elapsedTime * 0.33;
    apiCounter = Math.min(apiCounter, 15);
  }
  apiCounter -= 1; // Decrement the counter for the current API call
  lastApiCall = Date.now();
  return { apiCounter, lastApiCall };
}
